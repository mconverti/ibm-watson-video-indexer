const openwhisk = require('openwhisk'),
    openwhiskOptions = require('./config-openwhisk-credentials.json');

const VIDEO_ANALYZER_ACTION_NAME = 'videoAnalyzer';

openwhiskOptions.ignore_certs = true;
var openwhiskClient = openwhisk(openwhiskOptions);

function videoAnalyzer(videoId) {
    return openwhiskClient.actions.invoke({
        actionName: VIDEO_ANALYZER_ACTION_NAME,
        params: {
            videoId: videoId
        },
        blocking: false
    });
}

module.exports = {
    client: openwhiskClient,
    videoAnalyzer: videoAnalyzer
};