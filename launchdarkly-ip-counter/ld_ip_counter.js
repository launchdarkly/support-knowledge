const ipRangeCheck = require('ip-range-check');
const readline = require('readline');

// Fetch IP ranges from the LaunchDarkly API using fetch
async function fetchIpRanges(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP Status Code: ${response.status}`);
    }
    const parsedData = await response.json();
    if (!parsedData.addresses || !parsedData.outboundAddresses) {
        throw new Error('Invalid data structure');
    }
    return [...parsedData.addresses, ...parsedData.outboundAddresses];
}

// Check if the IP is in any of the provided ranges
function isIpInRange(ip, ranges) {
    return ranges.some(range => ipRangeCheck(ip, range));
}

// Main function to handle input and check IPs
async function main() {
    try {
        const ipRangesUrl = 'https://app.launchdarkly.com/api/v2/public-ip-list';
        const ipRanges = await fetchIpRanges(ipRangesUrl);
        const ipCount = {};

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.on('line', (line) => {
            if (isIpInRange(line, ipRanges)) {
                ipCount[line] = (ipCount[line] || 0) + 1;
            }
        });

        rl.on('close', () => {
            console.log('IPs associated with LaunchDarkly:');
            let total = 0;
            Object.entries(ipCount).forEach(([ip, count]) => {
                console.log(`${ip}: ${count}`);
                total += count;
            });
            console.log(`Total: ${total}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
