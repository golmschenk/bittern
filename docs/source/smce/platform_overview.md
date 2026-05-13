# Platform overview

The [Science Managed Cloud Environment (SMCE)](https://smce.nasa.gov) is a platform available for the RGES-PIT to use for large-scale batch computing. The SMCE is managed by the Roman Project and will also serve many of the computing needs of the Roman Project, the SOC, and the other PITs. It is also where the SOC will store Roman data, allowing the RGES-PIT direct access to data products.

The SMCE is hosted on [Amazon Web Services (AWS)](https://aws.amazon.com), the largest provider of cloud servers. The SMCE is able to spin up an arbitrary number of compute nodes (individual virtual machines that function as separate computers on the same network). The SMCE functions as a High-Performance Computing (HPC) center from the perspective of the user. That is, a service where a user can specify a job and request a set of computing resources to accomplish that job. The SMCE uses the [SLURM workload manager](https://slurm.schedmd.com/documentation.html) to handle job requests. Examples of making such requests are given in later tutorials.

```{image} smce_connection_overview.png
:width: 800px
```

The SMCE is connected to, but distinct from, the Roman Research Nexus (Nexus). The Nexus is also hosted on AWS. However, the Nexus is a publicly available platform with (in many ways) more limited capabilities. The Nexus should be seen as the public platform for access to Roman and PIT data and quick data analysis capabilities. The SMCE is for large-scale internal processing. Storage is available that is shared between the SMCE and the Nexus, so it's possible for the SMCE to make data available to Nexus users.