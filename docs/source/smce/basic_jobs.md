# Basic jobs

```{important}
With great power comes great responsibility. These computing resources cost money. Don't hestitate to use 1 node for 1
hour to test things. But don't request 100 nodes for 10 days unless you know what you're doing. The SMCE nodes are
large, expensive nodes.
```

As noted in [the platform overview documentation](./platform_overview.md), the SMCE acts as an HPC with SLURM as the
workload manager. You request a job with some specified computing resources, SLURM will spin-up nodes that meet those
requirements, and then run your job on those nodes.

## Minimal job

Let's start with a minimal job that will simply have a script that counts up for 60 seconds. A SLURM script is just a
bash script with some special `#SBATCH` comments that explain to SLURM what resources and configuration you want.
The remainder of the script runs mostly as normal. Save the following script as `minimal_job_example.bash`.
```bash
#!/bin/bash

#SBATCH --job-name=minimal_job
#SBATCH --partition=roman-c5n18xlarge-od
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem-per-cpu=5G
#SBATCH --time=00:02:00

for iteration in {1..60}
do
    echo $iteration
    sleep 1
done
```
`--job-name` is the name your job will have in SLURM. `--partition` is the partition you're requesting resources from. Each node that's available to use is grouped into one or more partitions. On the SMCE, specify the partition basically means specifying a specific type of node. `--ntasks` is the number of tasks. This is the number of copies of your script that get started. For now we're just creating one, but when you have multiple things that need to work in parallel (either independently or communicating with one another) you can increase this number (more on this in later examples). `--cpus-per-task` is the number of CPU cores we're requesting for each task. `--mem-per-cpu` is the memory per core we're requesting. `--mem-per-cpu=5G` is requesting 5GB of memory per cpu core. Note, we're not using the entire node here. If we only use a portion of the available node's cores and memory, other jobs (including our own) can use the remainder of the node. `--time` is the maximum wall-time job will be allowed to run for before SLURM will shut it down, regardless of if it has finished. The wall-time is in the format of `hours:minutes:seconds` with `00:02:00` being 2 minutes. You can also use `days-hours:minutes:seconds`. So `1-00:00:00` would request 1 day of time. [There are an enormous number of other possible parameters that can be specified](https://slurm.schedmd.com/sbatch.html) including different ways of specifying the above values (e.g., total memory instead of memory per core).

Put the above script into a file called `minimal_job_example.bash`, and then run it using
```sh
sbatch minimal_job_example.bash
```
This will add the job to the SLURM job queue and print out the job ID number. While in normal HPC centers you would need to wait until hardware becomes available for your job to run, the SMCE is cloud-based and will expand based on the need, so your job should start shortly. You can list the running jobs and jobs waiting to start with
```sh
squeue --long
```
If your job is waiting to run or currently running, you'll see something like
```
Thu Aug 28 00:04:37 2025
     JOBID PARTITION     NAME     USER    STATE       TIME TIME_LIMI  NODES NODELIST(REASON)
      2089 roman-c5n minimal_ golmsche  RUNNING       0:05      2:00      1 roman-c5n18xlarge-od-dy-c5n18xlarge-1
```
```{note}
You may see your job in the `CONFIGUR` state. It takes the SMCE about 5 minutes to spin up (configure) new nodes. If there's a running node your job can run on, the job will start almost immediately.
```
The stdout and stderr of your job will (by default) be written to a file named `slurm-<your_job_id>.out`. Here you will see the numbers printing from 1 to 60.


## Running many independent jobs

There are several ways to run many independent jobs in SLURM. The most common are
1. Use a wrapper script that calls the job script with different settings.
2. Use the [job array directive](https://rcpedia.stanford.edu/_user_guide/job_arrays/) to make several similar jobs with a single sbatch script.
3. Run a single job that internally distributes the processes across the multiple cores/nodes.

Depending on your specific purpose, one of these options might be better than the others. However, the wrapper script is flexible enough for most uses and avoids the need to learn SLURM-specific functionality. It may not provide the most compact of a solution (in terms of script length), but it will be more understandable for most users. Below are two examples of the wrapper script method, one using Bash as the wrapper and the other using Python. Both methods will use the same sbatch script, so we will look at that first. First, create the file `wrapped_job_example.bash` containing
```bash
#!/bin/bash

#SBATCH --partition=roman-c5n18xlarge-od
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem-per-cpu=5G
#SBATCH --time=00:01:00

echo "${1}"
```
This script simply echos the passed in argument. Of course, we could do anything with this argument, such as pass it to another program. One use case would be if you expect the argument passed is a path to a file to process. Note, as opposed to the minimal exmaple above, we are not setting the job name. We'll set this directly when calling `sbatch` so that we can name each job based on the passed argument. Next, we'll write the wrapper scripts, which will each do the same thing, but one in Bash and one in Python.

### Bash version

Create a Bash script called `wrapper_job_example.bash` with containing
```bash
#!/bin/bash

light_curve_paths=(
    "light_curve0.asdf"
    "light_curve1.asdf"
    "light_curve2.asdf"
)

for light_curve_path in "${light_curve_paths[@]}"
do
    sbatch --job-name="${light_curve_path}" wrapped_job_example.bash "${light_curve_path}"
done
```
This creates a job for each of the three light curve paths give. We're passing the light curve to be used in the sbatch script. We're also setting the job name from the `sbatch` call by passing `--job-name`. This is useful to make sure each job is named differently. This method of setting the `sbatch` configuration directly during the call can be used for any of the configuration settings. If you actually have a list of `.asdf` files available, in the wrapper batch script, you can create your list of light curve paths with `light_curve_paths=(*.asdf)` instead so you don't need to specify each file manually.

The wrapper script can then be called using `bash wrapper_job_example.bash`.

### Python version

Bash is ok for simple scripts, but as soon as any additional complexity is needed, using a language like Python makes things much easier. Create a Python script called `wrapper_job_example.py` containing
```python
import subprocess
from pathlib import Path

light_curve_paths = [
    Path('light_curve0.asdf'),
    Path('light_curve1.asdf'),
    Path('light_curve2.asdf'),
]

for light_curve_path in light_curve_paths:
    subprocess.run([
        'sbatch',
        f'--job-name={light_curve_path}',
        'wrapped_job_example.bash',
        light_curve_path,
    ])
```
This creates a job for each of the three light curve paths give. We're passing the light curve to be used in the sbatch script. We're also setting the job name from the `sbatch` call by passing `--job-name`. This is useful to make sure each job is named differently. This method of setting the `sbatch` configuration directly during the call can be used for any of the configuration settings. If you actually have a list of `.asdf` files available, in the wrapper batch script, you can create your list of light curve paths with `light_curve_paths=Path('.').glob('*.asdf')` instead so you don't need to specify each file manually.

The wrapper script can then be called using `python wrapper_job_example.py`.
