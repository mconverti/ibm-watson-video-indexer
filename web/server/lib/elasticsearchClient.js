const elasticsearch = require('elasticsearch'),
    elasticsearchCredentials = require('./config-elasticsearch-credentials.json'),
    elasticsearchSettings = require('./config-elasticsearch-settings.json');

const elasticsearchClient = new elasticsearch.Client({
    hosts: [
        elasticsearchCredentials.uri,
        elasticsearchCredentials.uri_direct_1
    ],
    ssl: {
        ca: new Buffer(elasticsearchCredentials.ca_certificate_base64, 'base64')
    }
});

function createIndexIfNotExists() {
    return new Promise((resolve, reject) => {
        elasticsearchClient.indices.exists({
            index: elasticsearchSettings.videos_index_name
        }, (err, resp, status) => {
            if (!!resp) {
                resolve();
            } else {
                elasticsearchClient.indices.create({
                    index: elasticsearchSettings.videos_index_name
                }, (err, resp, status) => {
                    if (!!err) {
                        reject(err);
                        return;
                    }

                    elasticsearchClient.indices.putMapping({
                        index: elasticsearchSettings.videos_index_name,
                        type: elasticsearchSettings.video_type_name,
                        body: {
                            properties: {
                                title: { type: 'string' },
                                description: { type: 'string' },
                                url: { type: 'string', index: 'no' },
                                duration: { type: 'double' },
                                tags: { type: 'string' },
                                identities: { type: 'string' },
                                imageUrl: { type: 'string', index: 'no' },
                                date: { type: 'date' },
                                // state processing management
                                state: { type: 'string', index: 'not_analyzed' },
                                stateDescription: { type: 'string', index: 'not_analyzed' },
                                step: { type: 'long' }
                            }
                        }
                    }, (err, resp, status) => {
                        if (!!err) {
                            reject(err);
                            return;
                        }

                        elasticsearchClient.indices.putMapping({
                            index: elasticsearchSettings.videos_index_name,
                            type: elasticsearchSettings.video_analytics_type_name,
                            body: {
                                properties: {
                                    // video analytics properties
                                    start: { type: 'double' },
                                    end: { type: 'double' },
                                    text: { type: 'string' },
                                    tags: { type: 'string' },
                                    faces: { type: 'long' },
                                    identities: { type: 'string' },
                                    imageUrl: { type: 'string', index: 'no' },
                                    date: { type: 'date' },
                                    // video properties
                                    videoId: { type: 'string', index: 'not_analyzed' },
                                    videoTitle: { type: 'string', index: 'no' },
                                    videoUrl: { type: 'string', index: 'no' }
                                }
                            }
                        }, (err, resp, status) => {
                            if (!!err) {
                                reject(err);
                                return;
                            }

                            resolve();
                        });
                    });
                });
            }
        });
    });
}

function getVideo(videoId) {
    console.log(`Started getting video document "${videoId}" from Elasticsearch.`);

    return new Promise((resolve, reject) => {
        elasticsearchClient.get({
            index: elasticsearchSettings.videos_index_name,
            type: elasticsearchSettings.video_type_name,
            id: videoId
        }, (err, resp, status) => {
            if (!!err) {
                console.error(`Failed to get video document "${videoId}" from Elasticsearch.`);
                reject(err);
                return;
            }

            console.log(`Video document "${videoId}" retrieved from Elasticsearch.`);
            resolve(resp._source);
        });
    });
}

function getImages(videoId) {
    console.log(`Started getting image documents for "${videoId}" video from Elasticsearch.`);

    return new Promise((resolve, reject) => {
        elasticsearchClient.search({
            index: elasticsearchSettings.videos_index_name,
            type: elasticsearchSettings.video_analytics_type_name,
            size: 10000,
            body: {
                query: {
                    constant_score: {
                        filter: {
                            term: { videoId: videoId }
                        }
                    }
                },
                sort: [
                    { _score: { order: 'desc' } },
                    { date: { order: 'desc' } },
                    { start: { order: 'asc' } }
                ]
            }
        }, (err, resp, status) => {
            if (!!err) {
                console.error(`Failed to get image document for "${videoId}" video from Elasticsearch.`);
                reject(err);
                return;
            }

            var results = resp.hits.hits
                .map((h) => {
                    return {
                        timestamp: h._source.start,
                        url: h._source.imageUrl,
                    };
                })
                .filter((i) => {
                    return !!i.url;
                });

            console.log(`Image documents for "${videoId}" video retrieved from Elasticsearch.`);
            resolve(results);
        });
    });
}

function indexVideo(videoId, videoDocument) {
    console.log(`Started saving video document "${videoId}" in Elasticsearch.`);

    return new Promise((resolve, reject) => {
        elasticsearchClient.index({
            index: elasticsearchSettings.videos_index_name,
            type: elasticsearchSettings.video_type_name,
            id: videoId,
            body: videoDocument
        }, (err, resp, status) => {
            if (!!err) {
                console.error(`Failed to save video document "${videoId}" in Elasticsearch.`);
                reject(err);
                return;
            }

            console.log(`Video document "${videoId}" saved in Elasticsearch.`);
            resolve();
        });
    });
}

function indexVideoAnalytics(videoAnalyticsDocuments) {
    console.log('Started saving video analytics documents in Elasticsearch.');

    var bulk = [];
    for (var i = 0; i < videoAnalyticsDocuments.length; i++) {
        bulk.push(
            { index: { _index: elasticsearchSettings.videos_index_name, _type: elasticsearchSettings.video_analytics_type_name } },
            videoAnalyticsDocuments[i]
        );
    }

    return new Promise((resolve, reject) => {
        if (bulk.length === 0) {
            console.log('No video analytics documents to save in Elasticsearch.');
            resolve();
        } else {
            elasticsearchClient.bulk({
                maxRetries: 5,
                index: elasticsearchSettings.videos_index_name,
                type: elasticsearchSettings.video_analytics_type_name,
                body: bulk
            }, (err, resp, status) => {
                if (!!err) {
                    console.error('Failed to save video analytics documents in Elasticsearch.');
                    reject(err);
                    return;
                }

                console.log('Video analytics documents saved in Elasticsearch.');
                resolve();
            });
        }
    });
}

module.exports = {
    client: elasticsearchClient,
    createIndexIfNotExists: createIndexIfNotExists,
    getVideo: getVideo,
    getImages: getImages,
    indexVideo: indexVideo,
    indexVideoAnalytics: indexVideoAnalytics,
    videoStates: {
        UPLOADED: 'uploaded',
        ANALYZING: 'analyzing',
        COMPLETE: 'complete',
        ERROR: 'error',
    }
}