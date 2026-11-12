
const url = 'http://localhost:4004/odata/v4/transfer/dispatchTransfer';

const requestBody = {
    transferID: '8196ccb8-4905-4f72-ab11-ba7765e20202',
    itemID: 'bb546b7e-91e0-464a-b228-69720a32e300',
    quantity: 1,
    performedBy: 'Admin',
    reason: 'Concurrent dispatch verification',
    expectedDate: '2026-11-13'
};

async function sendDispatchRequest(requestNumber) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.text();

        return {
            request: requestNumber,
            status: response.status,
            response: result
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
        sendDispatchRequest(1),
        sendDispatchRequest(2)
    ]);

    console.log(JSON.stringify(results, null, 2));
}

runTest();
