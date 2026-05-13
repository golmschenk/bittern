# Platform overview

For most RGES-PIT members that are producing code to run in the pipeline, there are only a few important things about the platform to know. The pipeline will run on Amazon Web Services (AWS). Your code should be set up such that it can run for a small specific task. For example, taking as input the path to a light curve file and a path it should put the table of estimated parameters it produces. The pipeline will then run this bit of code on each light curve as it's made available. You will then also need to make this code run in a container. Basically, the container is a computing environment that is isolated from your computer's normal environment. We need this setup to make sure that your code will run on the cloud machine, which will not have your local environment. This guide will help you get your code into a container and test that it works in that container. The container should also work locally for you to test as well, but then you can put it up to the AWS pipeline for it to run in the real production environment.

```{image} rges_pipeline_containerization.png
:width: 800px
```