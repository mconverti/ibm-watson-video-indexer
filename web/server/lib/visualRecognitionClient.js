const VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3'),
    visualRecognitionCredentials = require('./config-visual-recognition-credentials.json');

var visualRecognitionClient = new VisualRecognitionV3({
  api_key: visualRecognitionCredentials.api_key,
  version_date: '2016-05-19'
});

module.exports = visualRecognitionClient;