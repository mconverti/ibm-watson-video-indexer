const SpeechToTextV1 = require('watson-developer-cloud/speech-to-text/v1'),
    speechToTextCredentials = require('./config-speech-to-text-credentials.json');

var speechToTextClient = new SpeechToTextV1({
    username: speechToTextCredentials.username,
    password: speechToTextCredentials.password
});

module.exports = speechToTextClient;