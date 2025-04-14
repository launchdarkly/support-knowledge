const sdkKey = "";


const fs = require('fs');
const https = require('https');

(async () => {
    const url = 'https://app.launchdarkly.com/sdk/latest-all';
    const headers = {
        'Authorization': sdkKey
    };

    // const sdkPayload = (await fetch(url, { headers })).json();
    const sdkPayload = await new Promise((resolve, reject) => {
        const req = https.request(url, { headers }, (res) => {
            console.log('Fetching data from LaunchDarkly...');
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log('Data fetched from LaunchDarkly');
                resolve(JSON.parse(data));
            });
        });
        req.on('error', (e) => reject(e));
        req.end();
    });

    const flagStats = getFlagStats(sdkPayload);
    const segmentStats = getSegmentStats(sdkPayload);

    console.log('Writing to flags.csv...');
    fs.writeFileSync('./flags.csv', toCSV(flagStats));
    console.log('Writing to segments.csv...');
    fs.writeFileSync('./segments.csv', toCSV(segmentStats));

    console.log('done');
})();

function getFlagStats(sdkPayload) {
    const flags = sdkPayload.flags;
    const flagKeys = Object.keys(flags);
    const allFlagStats = flagKeys.map(key => {
        const flag = flags[key];

        // if (flag.contextTargets.length > 0) {
        //     console.log(Object.keys(flag.contextTargets[0]));
        //     process.abort();
        // }
        // return;

        const flagStats = {};
        // General
        flagStats.flagKey = flag.key;
        flagStats.flagSize = calculateSize(flag);

        // Variations
        flagStats.variationCount = flag.variations.length;
        flagStats.variationSize = calculateSize(flag.variations);

        // Targets
        const targetCount = flag.targets.reduce((acc, target) => acc + target.values.length, 0);
        const contextTargetCount = flag.contextTargets.reduce((acc, target) => acc + target.values.length, 0);
        flagStats.targetCount = targetCount + contextTargetCount;
        flagStats.targetSize = calculateSize(flag.targets) + calculateSize(flag.contextTargets);

        // Rules
        flagStats.ruleCount = flag.rules.length;
        flagStats.ruleSize = calculateSize(flag.rules);

        return flagStats;
    });
    console.log('Highlights:');

    // sort by variationSize
    allFlagStats.sort((a, b) => b.variationSize - a.variationSize);
    console.log('Flag with the largest variation data: ', allFlagStats[0].flagKey, getSizeString(allFlagStats[0].variationSize));
    console.log('- 2nd place: ', allFlagStats[1].flagKey, getSizeString(allFlagStats[1].variationSize));
    console.log('- 3rd place: ', allFlagStats[2].flagKey, getSizeString(allFlagStats[2].variationSize));

    // sort by targetSize
    allFlagStats.sort((a, b) => b.targetSize - a.targetSize);
    console.log('Flag with the largest individual targeting data: ', allFlagStats[0].flagKey, getSizeString(allFlagStats[0].targetSize));
    console.log('- 2nd place: ', allFlagStats[1].flagKey, getSizeString(allFlagStats[1].targetSize));
    console.log('- 3rd place: ', allFlagStats[2].flagKey, getSizeString(allFlagStats[2].targetSize));

    // sort by ruleSize
    allFlagStats.sort((a, b) => b.ruleSize - a.ruleSize);
    console.log('Flag with the largest rule data: ', allFlagStats[0].flagKey, getSizeString(allFlagStats[0].ruleSize));
    console.log('- 2nd place: ', allFlagStats[1].flagKey, getSizeString(allFlagStats[1].ruleSize));
    console.log('- 3rd place: ', allFlagStats[2].flagKey, getSizeString(allFlagStats[2].ruleSize));

    // sort by flagSize
    allFlagStats.sort((a, b) => b.flagSize - a.flagSize);
    console.log('Biggest flag: ', allFlagStats[0].flagKey, getSizeString(allFlagStats[0].flagSize));
    console.log('- 2nd place: ', allFlagStats[1].flagKey, getSizeString(allFlagStats[1].flagSize));
    console.log('- 3rd place: ', allFlagStats[2].flagKey, getSizeString(allFlagStats[2].flagSize));

    return allFlagStats;
}

function getSegmentStats(sdkPayload) {
    const segments = sdkPayload.segments;
    const segmentKeys = Object.keys(segments);
    const allSegmentStats = segmentKeys.map(key => {
        const segment = segments[key];
        const segmentStats = {};
        // General
        segmentStats.segmentKey = segment.key;
        segmentStats.segmentSize = calculateSize(segment);

        // Targets
        segmentStats.targetCount = segment.included.length + segment.excluded.length + segment.includedContexts.length + segment.excludedContexts.length;
        segmentStats.targetSize = calculateSize(segment.included) + calculateSize(segment.excluded) + calculateSize(segment.includedContexts) + calculateSize(segment.excludedContexts);

        // Rules
        segmentStats.ruleCount = segment.rules.length;
        segmentStats.ruleSize = calculateSize(segment.rules);
        return segmentStats;
    });

    console.log('Highlights:');
    // sort by ruleSize
    allSegmentStats.sort((a, b) => b.ruleSize - a.ruleSize);
    console.log('Segment with the largest rule data: ', allSegmentStats[0].segmentKey, getSizeString(allSegmentStats[0].ruleSize));
    console.log('- 2nd place: ', allSegmentStats[1].segmentKey, getSizeString(allSegmentStats[1].ruleSize));
    console.log('- 3rd place: ', allSegmentStats[2].segmentKey, getSizeString(allSegmentStats[2].ruleSize));

    // sort by targetSize
    allSegmentStats.sort((a, b) => b.targetSize - a.targetSize);
    console.log('Segment with the largest individual targeting data: ', allSegmentStats[0].segmentKey, getSizeString(allSegmentStats[0].targetSize));
    console.log('- 2nd place: ', allSegmentStats[1].segmentKey, getSizeString(allSegmentStats[1].targetSize));
    console.log('- 3rd place: ', allSegmentStats[2].segmentKey, getSizeString(allSegmentStats[2].targetSize));

    // sort by segmentSize
    allSegmentStats.sort((a, b) => b.segmentSize - a.segmentSize);
    console.log('Biggest segment: ', allSegmentStats[0].segmentKey, getSizeString(allSegmentStats[0].segmentSize));
    console.log('- 2nd place: ', allSegmentStats[1].segmentKey, getSizeString(allSegmentStats[1].segmentSize));
    console.log('- 3rd place: ', allSegmentStats[2].segmentKey, getSizeString(allSegmentStats[2].segmentSize));

    return allSegmentStats;
}

function calculateSize(data) {
    const objectString = JSON.stringify(data);
    return Buffer.byteLength(objectString, 'utf8');
}

function getSizeString(size) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let unitIndex = 0;
    while (size >= 1024) {
        size /= 1024;
        unitIndex++;
    }
    return size.toFixed(2) + units[unitIndex];
}

function toCSV(list) {
    return [Object.keys(list[0]).join(',')].concat(list.map(flag => Object.values(flag).join(','))).join('\n');
}
