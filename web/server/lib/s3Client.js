const s3 = require('s3'),
    s3Credentials = require('./config-s3-credentials.json'),
    s3Endpoint = require('./config-s3-endpoint.json');

var s3Client = s3.createClient({
    s3Options: {
        accessKeyId: s3Credentials.key,
        secretAccessKey: s3Credentials.secret,
        endpoint: s3Endpoint.endpoint
    }
});

module.exports = s3Client;