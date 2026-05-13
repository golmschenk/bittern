# Containerizing Your Code

## Why?

Your code currently runs on your machine, but we need to be certain that we can throw it on any cloud machine and have it work there. A container can be seen basically as a minimal version of Linux. It will contain only the tools needed to run your code. But it will be a static, consistent configuration such that we'll be able to run this a year from now, and it will work exactly the same. It will be versioned so that your can produce new versions if your setup needs updates, but we can return to old versions if we need to reproduce a result.

## Install a container tool

For local testing of your container, Docker is going to be the easiest option. Specifically, if you have no pre-existing containerization experience, Docker Desktop will be the easiest tool to use. Here are install instructions [macOS](https://docs.docker.com/desktop/setup/install/mac-install/), [Linux](https://docs.docker.com/desktop/setup/install/linux/), and [Windows](https://docs.docker.com/desktop/setup/install/windows-install/). If you have used other container platform experience, any container tool to produce ORI containers should be fine.

## 