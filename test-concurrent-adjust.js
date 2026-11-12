const url = 'http://localhost:4004/odata/v4/inventory/adjustStock';

const requestBody = {
    stockBalanceID: '70000000-0000-4000-8000-000000000001',
    stockCategory: 'UNRESTRICTED',
    adjustmentType: 'INCREASE',
    quantity: 1,
    movementReasonID: '30000000-0000-4000-8000-000000000005',
    performedBy: 'Admin',
    referenceNumber: 'CONCURRENT-ADJUST-001'
};

async function sendRequest(requestNumber) {
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
        sendRequest(1),
        sendRequest(2)
    ]);

    console.log(JSON.stringify(results, null, 2));
}

runTest();