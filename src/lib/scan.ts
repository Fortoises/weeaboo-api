import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper as axiosCookieJarSupport } from 'axios-cookiejar-support';

// This script performs a deep scan of a URL to help with debugging scrapers.
// It mimics a browser by using a standard User-Agent, handling cookies, and allowing a custom Referer.

async function scanUrl(url: string, referer?: string) {
    if (!url) {
        console.error('ERROR: Please provide a URL to scan as the first argument.');
        process.exit(1);
    }

    console.log(`--- Scanning URL: ${url} ---`);
    if (referer) {
        console.log(`--- With Referer: ${referer} ---`);
    }

    const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    if (referer) {
        headers['Referer'] = referer;
    }

    // Setup axios with cookie support
    const jar = new CookieJar();
    const client = axios.create({
        jar,
        withCredentials: true, // Important for sending cookies
        headers: headers
    });
    axiosCookieJarSupport(client);


    try {
        const response = await client.get(url);

        console.log('\n--- Response Status ---');
        console.log(`${response.status} ${response.statusText}`);

        console.log('\n--- Response Headers ---');
        console.log(response.headers);

        console.log('\n--- Cookies Received ---');
        console.log(await jar.getCookies(url));

        console.log('\n--- Response Body (Truncated) ---');
        // Truncate body to avoid flooding the console
        const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        console.log(body.substring(0, 2000));
        if (body.length > 2000) {
            console.log('\n... (body truncated)');
        }

    } catch (error: any) {
        console.error('\n--- ERROR ---');
        if (error.response) {
            console.error(`Status: ${error.response.status} ${error.response.statusText}`);
            console.error('Headers:', error.response.headers);
            console.error('Body:', error.response.data);
        } else if (error.request) {
            console.error('The request was made but no response was received.');
            console.error(error.request);
        } else {
            console.error('Error setting up the request:', error.message);
        }
    }
}

// Get URL and optional Referer from command line arguments
const urlToScan = process.argv[2];
const refererUrl = process.argv[3];
scanUrl(urlToScan, refererUrl);