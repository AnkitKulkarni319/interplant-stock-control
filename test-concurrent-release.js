const url = 'http://localhost:4004/odata/v4/inventory/releaseReservation';

const requestBody = {
    reservationID: 'bef36354-f186-43ee-accc-52f7f30faba4',
    quantity: 1,
    performedBy: 'Admin'
};

async function sendReleaseRequest(requestNumber) {
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
        sendReleaseRequest(1),
        sendReleaseRequest(2)
    ]);

    console.log(JSON.stringify(results, null, 2));
}

runTest();