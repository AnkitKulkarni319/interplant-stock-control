const url = 'http://localhost:4004/odata/v4/transfer/reserve';

const requestBody = {
    transferID: '2d201e5b-c603-4a65-bfdc-495daa103c01',
    itemID: '794133f8-1e58-497c-8457-687547635b51',
    performedBy: 'Admin'
};

async function sendReserveRequest(requestNumber) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        return {
            request: requestNumber,
            status: response.status,
            response: await response.text()
        };
    } catch (error) {
        return {
            request: requestNumber,
            error: error.message
        };
    }
}

async function runTest() {
    const results = await Promise.all([
        sendReserveRequest(1),
        sendReserveRequest(2)
    ]);

    console.log(JSON.stringify(results, null, 2));
}

runTest();