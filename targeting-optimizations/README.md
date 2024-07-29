# LaunchDarkly Connection Counter Tool

## Overview
This scripts are designed to find optimizations in your current redundant contexts  a snapshot of all IP addresses a host is connected to and check if any of these IPs are associated with LaunchDarkly's infrastructure. This tool is currently in beta, and feedback on any issues is highly appreciated.

## Requirements
These tools require you to have a .json file of a current LaunchDarkly environment flags and segments targeting configurations from the streaming or polling endpoint that the SDK uses. To obtain this, you can ping the streaming endpoint and save the response to a .json file, example:

```
curl -i -H "Authorization: SDK_KEY" https://stream.launchdarkly.com/all > ld_file.json
```

## Usage

```
python targeting_comparison.py /path/to/ld_file.json
```

or

```
python find_unused_segments.py /path/to/ld_file.json
```

### Understanding the data



### Support
For assistance, you can contact LaunchDarkly support with the name of the LaunchDarkly project and environment in your account that you wish to have analyzed.
