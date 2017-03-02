const exec = require('child-process-promise').exec,
    path = require('path'),
    fs = require('fs'),
    tmp = require('tmp'),
    http = require('http'),
    speechToTextClient = require('./lib/speechToTextClient.js'),
    elasticsearchClient = require('./lib/elasticsearchClient.js');

const FFMPEG_PATH = 'ffmpeg';
const AUDIO_RECOGNITION_FILE_CODEC = 'opus';
const AUDIO_RECOGNITION_CONFIDENCE_MIN_THRESHOLD = 0.5;
const IMAGE_GENERATION_INTERVAL_SECONDS = 3;

// argv[2] is expected to be the payload JSON object as a string
const payload = JSON.parse(process.argv[2]);
console.log('Payload', payload);

const videoId = payload.videoId;
console.log(`Started speech recognition processing for video "${videoId}"...`);

const tmpFolder = tmp.dirSync({ unsafeCleanup: true });

var exitCode = 0;

elasticsearchClient.getVideo(videoId)
    .then((videoDocument) => {
        videoDocument.state = elasticsearchClient.videoStates.ANALYZING;
        videoDocument.stateDescription = 'Speech recognition running';
        videoDocument.step++;

        return elasticsearchClient.indexVideo(videoId, videoDocument)
            .then(() => {

                return elasticsearchClient.getImages(videoId)
                    .then((imageFiles) => {
                        var videoUrl = `http:${videoDocument.url}`;

                        return downloadFile(videoUrl)
                            .then((videoFilePath) => {

                                return extractAudioFile(videoFilePath)
                                    .then((audioFilePath) => {

                                        return audioRecognition(audioFilePath)
                                            .then((transcriptDocuments) => {
                                                setImageUrl(transcriptDocuments, imageFiles);
                                                setVideoProperties(transcriptDocuments, videoId, videoDocument.title, videoDocument.url, videoDocument.date);

                                                return elasticsearchClient.indexVideoAnalytics(transcriptDocuments)
                                                    .then(() => {
                                                        videoDocument.state = elasticsearchClient.videoStates.COMPLETE;
                                                        videoDocument.stateDescription = 'Speech recognition complete';
                                                        videoDocument.step++;

                                                        return elasticsearchClient.indexVideo(videoId, videoDocument)
                                                            .then(() => {
                                                                console.log(`Speech recognition for "${videoId}" video successfully processed.`);
                                                            });
                                                    });
                                            });
                                    });
                            });
                    });
            })
            .catch((err) => {
                exitCode = 1;
                videoDocument.state = elasticsearchClient.videoStates.ERROR;
                videoDocument.stateDescription = 'Speech recognition error';

                elasticsearchClient.indexVideo(videoId, videoDocument);

                throw err;
            });
    })
    .catch((err) => {
        exitCode = 1;
        console.error(`Failed to process speech recognition for "${videoId}" video.`, err);
    })
    .then(() => {
        tmpFolder.removeCallback();
        process.exit(exitCode);
    });

//// HELPERS ////

function downloadFile(fileUrl) {
    var filePath = path.join(tmpFolder.name, path.basename(fileUrl));
    var file = fs.createWriteStream(filePath);

    console.log(`Started downloading "${fileUrl}" file...`);

    return new Promise((resolve, reject) => {
        var request = http.get(fileUrl, (response) => {
            response
                .pipe(file)
                .on('close', () => {
                    console.log(`"${fileUrl}" file downloaded at "${filePath}".`);
                    resolve(filePath);
                });
        });

        request.on('error', (err) => {
            console.error(`Failed to download "${fileUrl}" file.`);
            reject(err);
        });
    });
}

function extractAudioFile(videoFilePath) {
    console.log(`Started extracting audio from "${videoFilePath}" video file...`);

    var videoFileNameWithoutExtension = path.basename(videoFilePath, path.extname(videoFilePath));
    var audioFilePath = path.join(tmpFolder.name, `${videoFileNameWithoutExtension}.${AUDIO_RECOGNITION_FILE_CODEC}`);
    var ffmepgExtractAudioCommand = `${FFMPEG_PATH} -i "${videoFilePath}" -af aformat=channel_layouts="7.1|5.1|stereo" -vn -acodec ${AUDIO_RECOGNITION_FILE_CODEC} "${audioFilePath}"`;

    return exec(ffmepgExtractAudioCommand)
        .then((result) => {
            console.log(`Audio extracted into "${audioFilePath}" file.`);

            return audioFilePath;
        });
}

function audioRecognition(audioFilePath) {
    console.log(`Started transcript recognition from "${audioFilePath}" audio file.`);

    return new Promise((resolve, reject) => {
        var params = {
            content_type: `audio/ogg; codecs=${AUDIO_RECOGNITION_FILE_CODEC}`,
            continuous: true,
            timestamps: true,
            word_confidence: false,
            interim_results: true,
            max_alternatives: 1,
            inactivity_timeout: -1,
            smart_formatting: true,
            profanity_filter: false
        };
        var error = false;
        var warning = false;
        var transcriptDocuments = [];
        var recognizeStream = speechToTextClient.createRecognizeStream(params);
        fs.createReadStream(audioFilePath)
            .pipe(recognizeStream);

        recognizeStream.on('results', (data) => {
            var result = data.results[0];

            if (!!result && !!result.final) {
                console.log(`Received partial transcript #${data.result_index + 1} for "${audioFilePath}" audio file.`);
                var transcriptDocument = buildTranscriptDocument(result.alternatives[0]);
                if (!!transcriptDocument) {
                    transcriptDocuments.push(transcriptDocument);
                }
            }
        });

        recognizeStream.on('error', (err) => {
            if (transcriptDocuments.length > 0) {
                warning = true;
                console.warn(`Transcript recognition from "${audioFilePath}" audio file was interrupted: ${err.message}.`);
            } else {
                error = true;
                console.error(`Failed to recognize transcript from "${audioFilePath}" audio file.`);
                reject(err);
            }
        });

        recognizeStream.on('close', (code, reason) => {
            console.log(`Recognize transcript stream closed. Code: "${code}". Reason: "${reason}"`);

            if (!error) {
                transcriptDocuments.sort((d1, d2) => { return d1.start - d2.start; });
                if (!warning) {
                    console.log(`Transcript recognized from "${audioFilePath}" audio file.`);
                }

                // TODO: optimize by joining some transcripts
                resolve(transcriptDocuments);
            }
        });
    });
}

function buildTranscriptDocument(result) {
    var document = null;
    if (+result.confidence >= AUDIO_RECOGNITION_CONFIDENCE_MIN_THRESHOLD) {
        document = {
            start: +result.timestamps[0][1],
            end: +result.timestamps[result.timestamps.length - 1][2],
            text: result.transcript
        };
    }

    return document;
}

function setVideoProperties(analyticsDocuments, videoId, videoTitle, videoUrl, videoDate) {
    for (var i = 0; i < analyticsDocuments.length; i++) {
        var document = analyticsDocuments[i];
        document.videoId = videoId;
        document.videoTitle = videoTitle;
        document.videoUrl = videoUrl;
        document.date = videoDate;
    }
}

function setImageUrl(analyticsDocuments, imageFiles) {
    for (var i = 0; i < analyticsDocuments.length; i++) {
        var document = analyticsDocuments[i];

        var filteredImageFiles = imageFiles
            .filter((f) => { return (document.start <= f.timestamp) && (document.end >= f.timestamp); });

        if (filteredImageFiles.length == 0) {
            // Filter again with some padding
            var padding = IMAGE_GENERATION_INTERVAL_SECONDS / 2;
            filteredImageFiles = imageFiles
                .filter((f) => { return ((document.start - padding) <= f.timestamp) && ((document.end + padding) >= f.timestamp); });
        }

        if (filteredImageFiles.length > 0) {
            // Use the image in the middle
            document.imageUrl = filteredImageFiles[Math.round(filteredImageFiles.length / 2) - 1].url;
        }
    }
}