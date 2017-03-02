#!/bin/bash
#
# This script will build the speechAnalysis docker image and push it to dockerhub.
#
# Usage: buildAndPushSpeechAnalysis.sh imageName
#
# Dockerhub image names look like "username/appname" and must be all lower case.
# For example, "janesmith/calculator"

IMAGE_NAME=$1
./buildAndPush.sh $IMAGE_NAME speechAnalysis
