
const url = 'http://localhost:4004/odata/v4/inventory/reverseMovement';

const requestBody = {
    movementID: '6208e395-676f-4bf4-abfd-ac15172cdb38',
    performedBy: 'Admin',
    reason: 'STOCK_ADJUSTMENT'
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
