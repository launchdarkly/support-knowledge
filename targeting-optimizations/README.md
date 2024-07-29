# LaunchDarkly Targeting Optimization Tools

## Overview
This scripts are designed to find optimizations in your current LaunchDarkly targeting strategies. There are two tools: one to find contexts that have been individually targeted 2 or more times and one to find segments that are not being used in targeting. This tool is currently in beta, and feedback on any issues is highly appreciated.

## Requirements
These tools require you to have a .json file of a current LaunchDarkly environment flags and segments targeting configurations from the streaming or polling endpoint that the SDK uses. To obtain this, you can ping the streaming endpoint and save the response to a .json file, example:

```
curl -i -H "Authorization: SDK_KEY" https://stream.launchdarkly.com/all > ld_file.json
```

## Usage

```
python find_duplicate_targets.py /path/to/ld_file.json
```

or

```
python find_unused_segments.py /path/to/ld_file.json
```

### Understanding the data

For finding the context keys that are individually-targeted in 2 or more places in an environment, here's is the structure of the data:

```
<contextKey>: {
    'duplicate_flag_or_segment_key': [
      '<ldResourceType>: <ldResourceKey>', 
      '<ldResourceType>: <ldResourceKey>', 
      ...
    ], 
    'occurrences': <numberOfValuesInDuplicateArray + 1>
}
```

Where `ldResourceType` can either be a flag or segment. `ldResourceKey` is the `key` for the flag or segment.
The `duplicate_flag_or_segment_key` array of keys does not include the "first" instance the context was found.

If you are targeting many contexts individually in two or more flags and/or segments, it's potentially a sign that you could be using LaunchDarkly stanadard segments or big segments instead to collectivize inidividual targets and use the segment(s) instead.

### Support
For assistance, you can contact LaunchDarkly support with the name of the LaunchDarkly project and environment in your account that you wish to have analyzed.
