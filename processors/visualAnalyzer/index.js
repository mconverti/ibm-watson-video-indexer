const exec = require('child-process-promise').exec,
    async = require('async'),
    extend = require('extend'),
    path = require('path'),
    fs = require('fs'),
    tmp = require('tmp'),
    http = require('http'),
    visualRecognitionClient = require('./lib/visualRecognitionClient.js'),
    elasticsearchClient = require('./lib/elasticsearchClient.js'),
    s3Client = require('./lib/s3Client.js'),
    s3Endpoint = require('./lib/config-s3-endpoint.json');

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';
const IMAGE_GENERATION_NAME_SEPARATOR = '_';
const IMAGE_GENERATION_FILE_EXTENSION = '.jpg';
const IMAGE_GENERATION_INTERVAL_SECONDS = 3;
const IMAGE_GENERATION_INTERVAL_CORRECTION = 0.5;
const IMAGE_GENERATION_PROCESSING_CHUNK_SIZE = 50;
const VISUAL_RECOGNITION_CLASSIFY_METHOD = 'classify';
const VISUAL_RECOGNITION_DETECTFACES_METHOD = 'detectFaces';
const VISUAL_RECOGNITION_RECOGNIZETEXT_METHOD = 'recognizeText';
const VISUAL_RECOGNITION_METHODS = [VISUAL_RECOGNITION_CLASSIFY_METHOD, VISUAL_RECOGNITION_DETECTFACES_METHOD, VISUAL_RECOGNITION_RECOGNIZETEXT_METHOD];
const VISUAL_RECOGNITION_TIMEOUT_SECONDS = 20;
const VISUAL_RECOGNITION_TAG_SCORE_MIN_THRESHOLD = 0.6;
const VISUAL_RECOGNITION_TEXT_SCORE_MIN_THRESHOLD = 0.5;
const VISUAL_RECOGNITION_IDENTITY_SCORE_MIN_THRESHOLD = 0.5;
const VIDEO_SUMMARY_MAX_TAGS = 5;

// argv[2] is expected to be the payload JSON object as a string
const payload = JSON.parse(process.argv[2]);
console.log('Payload', payload);

const videoId = payload.videoId;
console.log(`Started visual recognition processing for video "${videoId}"...`);

const tmpFolder = tmp.dirSync({ unsafeCleanup: true });

var exitCode = 0;

elasticsearchClient.getVideo(videoId)
    .then((videoDocument) => {
        videoDocument.state = elasticsearchClient.videoStates.ANALYZING;
        videoDocument.stateDescription = 'Visual recognition running';
        videoDocument.step++;

        return elasticsearchClient.indexVideo(videoId, videoDocument)
            .then(() => {
                var videoUrl = `http:${videoDocument.url}`;

                return downloadFile(videoUrl)
                    .then((videoFilePath) => {

                        return getDuration(videoFilePath)
                            .then((duration) => {

                                return generateImages(videoFilePath)
                                    .then((imageFilePaths) => {

                                        return uploadFiles(imageFilePaths, duration)
                                            .then((imageFiles) => {

                                                return visualRecognition(imageFiles)
                                                    .then((sceneDocuments) => {
                                                        setVideoProperties(sceneDocuments, videoId, videoDocument.title, videoDocument.url, videoDocument.date);

                                                        return elasticsearchClient.indexVideoAnalytics(sceneDocuments)
                                                            .then(() => {
                                                                videoDocument.duration = duration;
                                                                videoDocument.imageUrl = imageFiles[Math.round(imageFiles.length / 2) - 1].url;
                                                                videoDocument.tags = getSummaryVideoTags(sceneDocuments, VIDEO_SUMMARY_MAX_TAGS);
                                                                videoDocument.identities = getSummaryVideoIdentities(sceneDocuments);
                                                                videoDocument.stateDescription = 'Visual recognition complete';
                                                                videoDocument.step++;

                                                                return elasticsearchClient.indexVideo(videoId, videoDocument)
                                                                    .then(() => {
                                                                        console.log(`Visual recognition for "${videoId}" video successfully processed.`);
                                                                    });
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
                videoDocument.stateDescription = 'Visual recognition error';

                elasticsearchClient.indexVideo(videoId, videoDocument);

                throw err;
            });
    })
    .catch((err) => {
        exitCode = 1;
        console.error(`Failed to process visual recognition for "${videoId}" video.`, err);
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


function getDuration(videoFilePath) {
    console.log(`Started getting duration for "${videoFilePath}" video file...`);

    var ffprobeGetDurationCommand = `${FFPROBE_PATH} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoFilePath}"`;

    return exec(ffprobeGetDurationCommand)
        .then((result) => {
            var duration = +result.stdout;
            if (!result.stdout) {
                duration = +result.stderr;
            }

            console.log(`The duration for "${videoFilePath}" video file is ${duration} seconds.`);

            return duration;
        });
}

function generateImages(videoFilePath) {
    console.log(`Started generating images for "${videoFilePath}" video file...`);

    var videoFileNameWithoutExtension = path.basename(videoFilePath, path.extname(videoFilePath));
    var imageFilesPath = path.join(tmpFolder.name, `${videoFileNameWithoutExtension}${IMAGE_GENERATION_NAME_SEPARATOR}image${IMAGE_GENERATION_NAME_SEPARATOR}%05d${IMAGE_GENERATION_FILE_EXTENSION}`);
    var ffmpegGenerateImagesCommand = `${FFMPEG_PATH} -i "${videoFilePath}" -qscale:v 2 -vf fps=1/${IMAGE_GENERATION_INTERVAL_SECONDS} "${imageFilesPath}"`;

    return exec(ffmpegGenerateImagesCommand)
        .then((result) => {
            var imageFilePaths = fs.readdirSync(tmpFolder.name)
                .filter((fileName) => { return fileName.endsWith(IMAGE_GENERATION_FILE_EXTENSION); })
                .map((fileName) => { return path.join(tmpFolder.name, fileName); });

            console.log(`${imageFilePaths.length} images were generated for "${videoFilePath}" video file.`);

            return imageFilePaths;
        });
}

function uploadFiles(imageFilePaths, duration) {
    var uploadImageFilePromises = [];
    for (var i = 0; i < imageFilePaths.length; i++) {
        var imageFilePath = imageFilePaths[i];

        uploadImageFilePromises.push(uploadFile(imageFilePath)
            .then((file) => {
                return { path: file.path, url: file.url, timestamp: getImageTimestamp(file.path, duration) };
            }));
    }

    return Promise.all(uploadImageFilePromises)
        .then((results) => {
            results.sort((img1, img2) => { return img1.timestamp - img2.timestamp; });

            return results;
        });
}

function uploadFile(filePath) {
    var fileName = path.basename(filePath);
    var bucketFilePath = `${videoId}/${fileName}`;
    var bucketFileUrl = `${videoId}/${encodeURIComponent(fileName)}`;

    return new Promise((resolve, reject) => {
        var params = {
            localFile: filePath,
            s3Params: {
                Bucket: s3Endpoint.bucket,
                Key: bucketFilePath,
                ACL: 'public-read'
            }
        };

        console.log(`Uploading "${filePath}" file to S3 storage...`);

        var s3Uploader = s3Client.uploadFile(params);
        s3Uploader.on('error', (err) => {
            console.error(`Failed to upload "${filePath}" file.`);
            reject(err);
        });
        s3Uploader.on('end', () => {
            var fileUrl = `//${s3Endpoint.endpoint}/${s3Endpoint.bucket}/${bucketFileUrl}`;
            console.log(`"${filePath}" file uploaded at "${fileUrl}".`);
            resolve({ path: filePath, url: fileUrl });
        });
    });
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

function visualRecognition(imageFiles) {
    var imageFilesChunks = [];

    for (var i = 0; i < imageFiles.length; i += IMAGE_GENERATION_PROCESSING_CHUNK_SIZE) {
        imageFilesChunks.push(imageFiles.slice(i, i + IMAGE_GENERATION_PROCESSING_CHUNK_SIZE));
    }

    return visualRecognitionChunk(0, imageFilesChunks, []);
}

function visualRecognitionChunk(index, imageFilesChunks, sceneDocuments) {
    if (index >= imageFilesChunks.length) {
        return new Promise((resolve, reject) => { resolve(sceneDocuments); });
    }

    var imageFiles = imageFilesChunks[index];
    var promises = [];

    for (var i = 0; i < imageFiles.length; i++) {
        var imageFile = imageFiles[i];

        promises.push(new Promise((resolve, reject) => {
            var imageUrl = imageFile.url;
            var timestamp = imageFile.timestamp;
            console.log(`Started visual recognition from "${imageUrl}" image.`);

            var params = {
                url: `http:${imageUrl}`
            };

            // Run the classifiers asynchronously and combine the results
            async.parallel(VISUAL_RECOGNITION_METHODS.map((method) => {
                var fn = visualRecognitionClient[method].bind(visualRecognitionClient, params);
                if (method === VISUAL_RECOGNITION_RECOGNIZETEXT_METHOD || method === VISUAL_RECOGNITION_DETECTFACES_METHOD) {
                    return async.reflect(async.timeout(fn, VISUAL_RECOGNITION_TIMEOUT_SECONDS * 1000));
                } else {
                    return async.reflect(fn);
                }
            }), (err, results) => {
                if (!!err) {
                    console.error(`Failed to visual recognize "${imageUrl}" image.`);
                    reject(err);
                    return;
                }

                // Combine the results
                var combine = results
                    .map((result) => {
                        if (result.value && result.value.length) {
                            // value is an array of arguments passed to the callback (excluding the error).
                            // In this case, it's the result and then the request object.
                            // We only want the result.
                            result.value = result.value[0];
                        }

                        return result;
                    })
                    .reduce((prev, cur) => { return extend(true, prev, cur); });

                var sceneDocument = buildSceneDocument(combine.value || {}, timestamp, imageUrl);

                console.log(`Visual recognition complete for "${imageUrl}" image.`);

                resolve(sceneDocument);
            });
        }));
    }

    return Promise.all(promises)
        .then((sceneDocumentsChunk) => {
            Array.prototype.push.apply(sceneDocuments, sceneDocumentsChunk);
            return visualRecognitionChunk(index + 1, imageFilesChunks, sceneDocuments);
        });
}

function buildSceneDocument(results, timestamp, imageUrl) {
    var scene = {
    };

    if (!!results.images && results.images.length > 0) {
        var image = results.images[0];
        scene.start = timestamp;
        scene.end = timestamp;
        scene.text = getImageText(image.words);
        scene.tags = getImageTags(image.classifiers || []);
        if (!!image.faces) {
            scene.faces = image.faces.length;
            scene.identities = getImageIdentities(image.faces);
        } else {
            scene.faces = 0;
            scene.identities = [];
        }

        scene.imageUrl = imageUrl;
    }

    return scene;
}

function getImageTimestamp(imageFileName, duration) {
    var parts = imageFileName.split(IMAGE_GENERATION_NAME_SEPARATOR);
    var imageNumber = +(parts[parts.length - 1].split('.')[0]);
    var timestamp = (imageNumber - IMAGE_GENERATION_INTERVAL_CORRECTION) * IMAGE_GENERATION_INTERVAL_SECONDS;

    if (timestamp > duration) {
        timestamp = duration;
    }

    return timestamp;
}

function getImageTags(classifiers) {
    var tags = [];

    if (!!classifiers && classifiers.length > 0) {
        var classes = classifiers[0].classes;
        if (!!classes && classes.length > 0) {
            for (var i = 0; i < classes.length; i++) {
                var c = classes[i];
                if (+c.score >= VISUAL_RECOGNITION_TAG_SCORE_MIN_THRESHOLD) {
                    tags.push(c.class);
                }
            }
        }
    }

    return tags;
}

function getImageText(words) {
    var text = '';

    if (!!words && words.length > 0) {
        for (var i = 0; i < words.length; i++) {
            var word = words[i];
            if (+word.score >= VISUAL_RECOGNITION_TEXT_SCORE_MIN_THRESHOLD) {
                text = !text ? word.word : `${text} ${word.word}`;
            }
        }
    }

    return text;
}

function getImageIdentities(faces) {
    var identities = [];
    for (var i = 0; i < faces.length; i++) {
        var face = faces[i];
        if (!!face.identity && (+face.identity.score >= VISUAL_RECOGNITION_IDENTITY_SCORE_MIN_THRESHOLD)) {
            identities.push(face.identity.name);
        }
    }

    return identities;
}

function getSummaryVideoTags(analyticsDocuments, maxTags) {
    var allTags = [];
    for (var i = 0; i < analyticsDocuments.length; i++) {
        var analyticsDocument = analyticsDocuments[i];
        Array.prototype.push.apply(allTags, analyticsDocument.tags);
    }

    var counts = {};
    for (var i = 0; i < allTags.length; i++) {
        var tag = allTags[i];
        counts[tag] = !!counts[tag] ? counts[tag] + 1 : 1;
    }

    // Descending order
    return Object.keys(counts)
        .sort((t1, t2) => { return counts[t2] - counts[t1]; })
        .slice(0, maxTags);
}

function getSummaryVideoIdentities(analyticsDocuments) {
    var allIdentities = [];
    for (var i = 0; i < analyticsDocuments.length; i++) {
        var analyticsDocument = analyticsDocuments[i];
        Array.prototype.push.apply(allIdentities, analyticsDocument.identities);
    }

    var counts = {};
    for (var i = 0; i < allIdentities.length; i++) {
        var identity = allIdentities[i];
        counts[identity] = !!counts[identity] ? counts[identity] + 1 : 1;
    }

    // Descending order
    return Object.keys(counts)
        .sort((i1, i2) => { return counts[i2] - counts[i1]; });
}