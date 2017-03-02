#!/bin/bash
#
# This script will build the visualAnalysis docker image and push it to dockerhub.
#
# Usage: buildAndPushVisualAnalysis.sh imageName
#
# Dockerhub image names look like "username/appname" and must be all lower case.
# For example, "janesmith/calculator"

IMAGE_NAME=$1
./buildAndPush.sh $IMAGE_NAME visualAnalyzer
