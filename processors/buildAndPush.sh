IMAGE_NAME=$1
echo "Using $IMAGE_NAME as the image name"

PROCESSOR=$2
echo "Using $PROCESSOR as the processor"

# grab the common package library
rm -rf $PROCESSOR/lib
cp -R ../web/server/lib $PROCESSOR

# Make the docker image
docker build -t $IMAGE_NAME -f Dockerfile_$PROCESSOR .
if [ $? -ne 0 ]; then
    echo "Docker build failed"
    exit
fi
docker push $IMAGE_NAME
if [ $? -ne 0 ]; then
    echo "Docker push failed"
    exit
fi

