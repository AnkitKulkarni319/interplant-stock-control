
const url = 'http://localhost:4004/odata/v4/transfer/receiveTransfer';

const requestBody = {
    transferID: 'fc5a49df-cec9-4a5b-8fa0-6c9f6a7ec497',
    itemID: '54b09b9e-c1b4-4289-b60b-9aa714a85723',
    goodQty: 1,
    damagedQty: 0,
    destinationStorageBinID: '60000000-0000-4000-8000-000000000003',
    performedBy: 'Admin'
};

async function sendReceiveRequest(requestNumber) {
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
        sendReceiveRequest(1),
        sendReceiveRequest(2)
    ]);

    console.log(JSON.stringify(results, null, 2));
}

runTest();
