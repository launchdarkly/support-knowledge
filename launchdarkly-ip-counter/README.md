# LaunchDarkly Connection Counter Tool

## Overview
This tool is designed to capture a snapshot of all IP addresses a host is connected to and check if any of these IPs are associated with LaunchDarkly's infrastructure. This tool is currently in beta, and feedback on any issues is highly appreciated.

## Requirements
The tool requires `netstat` to capture IP addresses from a host. While `netstat` is commonly included in many environments, certain ones, like Docker, may lack this utility. If `netstat` is not present, you can find installation instructions for various environments on the internet. Here is a helpful guide for Docker environments: [Installing netstat on Docker](https://stackoverflow.com/questions/41961217/installing-netstat-on-docker-linux-container).

## Usage

### Checking IPs
To identify LaunchDarkly IPs that your host is communicating with, run:

```
bash count_current_ld_ips.sh
```

This command captures and processes the IPs simultaneously. Please ensure NodeJS is installed in your environment to process the IPs. If NodeJS is not available, then follow the instructions below to save the IPs for later processing.

### Saving IPs for Later Processing
If NodeJS is not installed, you can save the IP list for processing in a different environment using:

```
bash save_all_ips.sh
```

This command saves the IPs to `all_ips.txt`. You can then transfer this file to a computer that has NodeJS and run:

```
bash process_all_ips.sh
```

### Support
For assistance, you can send the `all_ips.txt` file to LaunchDarkly support or process it as described above if NodeJS is available.
