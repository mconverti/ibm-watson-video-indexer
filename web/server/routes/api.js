const express = require('express'),
    timeout = require('connect-timeout'),
    uuid = require('node-uuid'),
    path = require('path'),
    router = express.Router(),
    skipperS3 = require('skipper-s3'),
    extend = require('extend'),
    s3Credentials = require('./../lib/config-s3-credentials.json'),
    s3Endpoint = require('./../lib/config-s3-endpoint.json'),
    s3Config = extend({}, s3Credentials, s3Endpoint),
    elasticsearchClient = require('./../lib/elasticsearchClient.js'),
    elasticsearchSettings = require('./../lib/config-elasticsearch-settings.json'),
    openwhiskClient = require('./../lib/openwhiskClient.js');

const DEFAULT_PAGE_SIZE = 25,
    UPLOAD_TIMEOUT = 3600000;

elasticsearchClient.createIndexIfNotExists().then(() => { console.log('Videos index ready'); });

/// API ENDPOINTS ///

router.get('/videos/:id', (req, res) => {
    return elasticsearchClient.getVideo(req.params.id)
        .then((video) => {
            video.id = req.params.id;
            video.type = elasticsearchSettings.video_type_name
            return res.send(video);
        })
        .catch((err) => {
            console.error(`Failed to get '${req.params.id}' video`, err);
            return res.status(500).send(err);
        });
});

router.get('/videos/:id/insights', (req, res) => {
    var params = {
        index: elasticsearchSettings.videos_index_name,
        type: elasticsearchSettings.video_analytics_type_name,
        size: req.query.size || DEFAULT_PAGE_SIZE,
        from: req.query.from || 0,
        search_type: 'dfs_query_then_fetch',
        body: buildVideoSearchQueryBody(req.params.id, req.query.search)
    };

    elasticsearchClient.client.search(params, (error, response, status) => {
        if (!!error) {
            console.error(`Failed to search videos with query '${req.query.search}'`, error);
            return res.status(500).send(error);
        }

        return res.send(mapResponse(response.hits));
    });
});

router.get('/videos', (req, res) => {
    var params = {
        index: elasticsearchSettings.videos_index_name,
        type: elasticsearchSettings.video_type_name,
        size: req.query.size || DEFAULT_PAGE_SIZE,
        from: req.query.from || 0,
        search_type: 'dfs_query_then_fetch',
        body: buildSearchQueryBody(req.query.search, ['title', 'description', 'tags', 'identities'])
    };

    elasticsearchClient.client.search(params, (error, response, status) => {
        if (!!error) {
            console.error(`Failed to search videos with query '${req.query.search}'`, error);
            return res.status(500).send(error);
        }

        return res.send(mapResponse(response.hits));
    });
});

router.get('/insights', (req, res) => {
    // If no search query, then return no results
    if (!req.query.search) {
        return res.send({ total: 0, results: [] });
    }

    var params = {
        index: elasticsearchSettings.videos_index_name,
        type: elasticsearchSettings.video_analytics_type_name,
        size: req.query.size || DEFAULT_PAGE_SIZE,
        from: req.query.from || 0,
        search_type: 'dfs_query_then_fetch',
        body: buildSearchQueryBody(req.query.search, ['text', 'tags', 'identities'])
    };

    elasticsearchClient.client.search(params, (error, response, status) => {
        if (!!error) {
            console.error(`Failed to search insights: ${req.query.search}`, error);
            return res.status(500).send(error);
        }

        return res.send(mapResponse(response.hits));
    });
});

router.post('/videos/upload', timeout(UPLOAD_TIMEOUT), (req, res) => {
    var file = req.file('file');
    var fileName = file._files[0].stream.filename;
    var videoId = uuid.v1();
    var bucketFilePath = `${videoId}/${videoId}${path.extname(fileName)}`;
    var options = extend({}, s3Config, {
        adapter: skipperS3,
        headers: {
            'x-amz-acl': 'public-read'
        },
        saveAs: bucketFilePath
    });

    file.upload(options, (uploadErr, uploadedFiles) => {
        if (!!uploadErr) {
            console.error('Failed to upload video', uploadErr);
            return res.status(500).send(uploadErr);
        }

        var videoDocument = {
            title: req.body.title,
            description: req.body.description,
            url: `//${s3Endpoint.endpoint}/${s3Endpoint.bucket}/${bucketFilePath}`,
            state: elasticsearchClient.videoStates.UPLOADED,
            stateDescription: 'Video file uploaded',
            step: 1,
            date: Date.now()
        };

        return elasticsearchClient.indexVideo(videoId, videoDocument)
            .then(() => {
                return openwhiskClient.videoAnalyzer(videoId)
                    .then(() => {
                        console.log(`Submitted video document "${videoId}" for processing`);
                        return res.status(200).send({ videoId: videoId });
                    })
                    .catch((err) => {
                        console.error(`Failed to submit video document "${videoId}" for processing`, err);
                        return res.status(500).send(err);
                    });
            })
            .catch((err) => {
                console.error('Failed to save video document', err);
                return res.status(500).send(err);
            });
    });
});

/// HELPERS ///

function buildSearchQueryBody(search, fields) {
    var queryBody = {
        query: {
            match_all: {}
        },
        sort: [
            { _score: { order: 'desc' } },
            { date: { order: 'desc' } },
            { start: { order: 'asc' } }
        ]
    };

    if (!!search && !!fields && (fields.length > 0)) {
        queryBody.query = {
            multi_match: {
                query: search,
                type: 'phrase', // 'best_fields',
                fields: fields,
                slop: 3
                //fuzziness : 'AUTO',
                //prefix_length : 2
            }
        };
    }

    return queryBody;
}

function buildVideoSearchQueryBody(videoId, search, fields) {
    var filter = {
        constant_score: {
            filter: {
                term: { videoId: videoId }
            }
        }
    };
    var queryBody = {
        query: {},
        sort: [
            { _score: { order: 'desc' } },
            { date: { order: 'desc' } },
            { start: { order: 'asc' } }
        ]
    };

    if (!!search) {
        queryBody.query = {
            filtered: {
                query: {
                    multi_match: {
                        query: search,
                        type: 'phrase', // 'best_fields',
                        fields: ['text', 'tags', 'identities'],
                        slop: 3
                        //fuzziness : 'AUTO',
                        //prefix_length : 2
                    }
                },
                filter: filter
            }
        };
    } else {
        queryBody.query = filter;
    }

    return queryBody;
}

function mapResponse(response) {
    return {
        total: response.total,
        results: response.hits.map((h) => {
            var result = h._source;
            result.id = h._id;
            result.type = h._type;

            return result;
        })
    }
}

module.exports = router;