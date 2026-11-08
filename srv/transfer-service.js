module.exports = cds.service.impl(function() {
    console.log('TransferService implementation loaded');
    const {
        TransferRequests,
        TransferItems,
        TransferEvents,
        StockBalances,
        Reservations
    } = this.entities;
const StockMovements = cds.entities('interplant').StockMovements;
//const DBStockBalances = cds.entities('interplant').StockBalances;

    this.on('submitTransfer', async (req) => {

        const { transferID, performedBy } = req.data;

        // Validate input
        if (!transferID || !performedBy) {
            return req.error(400, 'All fields are required');
        }

        // Find transfer request
        const transfer = await SELECT.one
            .from(TransferRequests)
            .where({ ID: transferID });

        if (!transfer) {
            return req.error(404, 'Transfer request not found');
        }

        // Validate transfer status
        if (transfer.status !== 'DRAFT') {
            return req.error(400, 'Only DRAFT transfers can be submitted');
        }

        // Check transfer items
        const item = await SELECT.one
            .from(TransferItems)
            .where({ transfer_ID: transferID });

        if (!item) {
            return req.error(400, 'Transfer must contain at least one item');
        }

        // Update transfer status
        await UPDATE(TransferRequests)
            .set({
                status: 'PENDING_APPROVAL'
            })
            .where({
                ID: transferID
            });

        // Create transfer event
        await INSERT.into(TransferEvents).entries({
            transfer_ID: transferID,
            eventType: 'TRANSFER_SUBMITTED',
            performedBy: performedBy,
            notes: 'Transfer submitted for approval'
        });

        // Return updated transfer
        return await SELECT.one
            .from(TransferRequests)
            .where({ ID: transferID });

    });



this.on('approveTransfer', async (req) => {

    const { transferID, performedBy } = req.data;

    // Validate input
    if (!transferID || !performedBy) {
        return req.error(400, 'All fields are required');
    }

    // Find transfer request
    const transfer = await SELECT.one
        .from(TransferRequests)
        .where({ ID: transferID });

    if (!transfer) {
        return req.error(404, 'Transfer request not found');
    }

    // Validate transfer status
    if (transfer.status !== 'PENDING_APPROVAL') {
        return req.error(400, 'Only pending approval transfers can be approved');
    }

    // Update transfer status
    await UPDATE(TransferRequests)
        .set({
            status: 'APPROVED'
        })
        .where({
            ID: transferID
        });

    // Create transfer event
    await INSERT.into(TransferEvents).entries({
        transfer_ID: transferID,
        eventType: 'TRANSFER_APPROVED',
        performedBy: performedBy,
        notes: 'Transfer approved successfully'
    });

    // Return updated transfer
    return await SELECT.one
        .from(TransferRequests)
        .where({ ID: transferID });

});



    this.on('reserve', async (req) => {

        const { transferID, itemID, performedBy } = req.data;

        if (!transferID || !itemID || !performedBy) {
            return req.error(400, 'All fields are required');
        }

        const transfer = await SELECT.one
            .from(TransferRequests)
            .where({ ID: transferID });

        if (!transfer) {
            return req.error(404, 'Transfer request not found');
        }

        if (transfer.status !== 'APPROVED') {
            return req.error(400, 'Only approved transfers can be reserved');
        }

const existingReservation = await SELECT.one
    .from(Reservations)
    .where({
        requirementReference: transfer.transferNumber
    });

if (existingReservation) {
    return req.error(400, 'Reservation already exists for this transfer');
}

        const item = await SELECT.one
            .from(TransferItems)
            .where({
                ID: itemID,
                transfer_ID: transferID
            });

        if (!item) {
            return req.error(404, 'Transfer item not found');
        }

        if (Number(item.requestedQty) <= 0) {
            return req.error(400, 'Requested quantity must be greater than zero');
        }

        const stockList = await SELECT.from(StockBalances)
            .where({
                material_ID: item.material_ID,
                plant_ID: transfer.sourcePlant_ID,
                storageLocation_ID: transfer.sourceStorageLocation_ID,
                batchNumber: item.batchNumber
            })
            .orderBy('storageBin_ID')
            .forUpdate();

        if (!stockList || stockList.length === 0) {
            return req.error(404, 'Source stock balance not found');
        }

        let totalAvailableQty = 0;

        for (const stock of stockList) {

            const availableQty = Number(stock.unrestrictedQty) -
                                 Number(stock.reservedQty);

            if (availableQty > 0) {
                totalAvailableQty += availableQty;
            }
        }

        if (totalAvailableQty < Number(item.requestedQty)) {
            return req.error(400, 'Insufficient available stock for reservation');
        }

        let remainingQty = Number(item.requestedQty);

        const reservationRecords = [];

        for (const stock of stockList) {

            const availableQty = Number(stock.unrestrictedQty) -
                                 Number(stock.reservedQty);

            if (availableQty <= 0) {
                continue;
            }

            const reserveQty = Math.min(availableQty, remainingQty);

            if (reserveQty > 0) {

                reservationRecords.push({
                    material_ID: item.material_ID,
                    plant_ID: transfer.sourcePlant_ID,
                    storageLocation_ID: transfer.sourceStorageLocation_ID,
                    storageBin_ID: stock.storageBin_ID,
                    batchNumber: item.batchNumber,
                    reservedQty: reserveQty,
                    releasedQty: 0,
                    consumedQty: 0,
                    status: 'ACTIVE',
                    requirementReference: transfer.transferNumber
                });

                remainingQty = remainingQty - reserveQty;
            }

            if (remainingQty <= 0) {
                break;
            }
        }

        if (remainingQty > 0) {
            return req.error(400, 'Insufficient stock for reservation');
        }

        for (const reservation of reservationRecords) {

            await INSERT.into(Reservations).entries(reservation);

            const stock = await SELECT.one
                .from(StockBalances)
                .where({
                    material_ID: reservation.material_ID,
                    plant_ID: reservation.plant_ID,
                    storageLocation_ID: reservation.storageLocation_ID,
                    storageBin_ID: reservation.storageBin_ID,
                    batchNumber: reservation.batchNumber
                });

            await UPDATE(StockBalances)
                .set({
                    reservedQty: Number(stock.reservedQty) +
                                 Number(reservation.reservedQty)
                })
                .where({
                    ID: stock.ID
                });
        }

        await INSERT.into(TransferEvents).entries({
            transfer_ID: transferID,
            eventType: 'STOCK_RESERVED',
            performedBy: performedBy,
            notes: 'Stock reserved successfully'
        });

       return await SELECT.from(Reservations).where({
    requirementReference: transfer.transferNumber
});

    });


    
this.on('startPicking', async (req) => {

    const {
        transferID,
        performedBy
    } = req.data;

    // 1. Validate input

    if (!transferID || !performedBy || !performedBy.trim()) {
        return req.error(400, 'All fields are required');
    }

    // 2. Find transfer request

    const transfer = await SELECT.one
        .from(TransferRequests)
        .where({
            ID: transferID
        });

    if (!transfer) {
        return req.error(404, 'Transfer request not found');
    }

    // 3. Validate transfer status

    if (transfer.status !== 'APPROVED') {
        return req.error(400, 'Only approved transfers can start picking');
    }

    // 4. Find transfer items

    const items = await SELECT.from(TransferItems)
        .where({
            transfer_ID: transferID
        });

    if (!items || items.length === 0) {
        return req.error(400, 'Transfer must contain at least one item');
    }

    // 5. Validate reservations for every transfer item

    for (const item of items) {

        const reservations = await SELECT.from(Reservations)
            .where({
                requirementReference: transfer.transferNumber,
                material_ID: item.material_ID,
                plant_ID: transfer.sourcePlant_ID,
                storageLocation_ID: transfer.sourceStorageLocation_ID,
                batchNumber: item.batchNumber
            });

        if (!reservations || reservations.length === 0) {
            return req.error(400, 'Reservation not found for transfer item');
        }

        let availableReservedQty = 0;

        for (const reservation of reservations) {

            if (
                reservation.status === 'ACTIVE' ||
                reservation.status === 'PARTIALLY_RELEASED'
            ) {

                const remainingQty =
                    Number(reservation.reservedQty) -
                    Number(reservation.releasedQty) -
                    Number(reservation.consumedQty);

                if (remainingQty > 0) {
                    availableReservedQty += remainingQty;
                }
            }
        }

        if (availableReservedQty < Number(item.requestedQty)) {
            return req.error(
                400,
                'Insufficient active reserved quantity for transfer item'
            );
        }
    }

    // 6. Update transfer status to PICKING

    await UPDATE(TransferRequests)
        .set({
            status: 'PICKING'
        })
        .where({
            ID: transferID
        });

    // 7. Create transfer event

    await INSERT.into(TransferEvents).entries({
        transfer_ID: transferID,
        eventType: 'PICKING_STARTED',
        performedBy: performedBy,
        notes: 'Warehouse picking started successfully'
    });

    // 8. Return updated transfer

    return await SELECT.one
        .from(TransferRequests)
        .where({
            ID: transferID
        });

});



this.on('dispatchTransfer', async (req) => {

    const {
        transferID, itemID, quantity, performedBy, reason, expectedDate
    } = req.data;

    // 1. Validate input
    if (!transferID || !itemID || !performedBy || !performedBy.trim()) {
        return req.reject(400, 'Transfer ID, Item ID and Performed By are required');
    }

    if (quantity === undefined || quantity === null ||
        !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        return req.reject(400, 'Dispatch quantity must be greater than zero');
    }

    const tx = cds.tx(req);
    const qty = Number(quantity);

    // 2. Get transfer and item
    const transfer = await tx.run(
        SELECT.one.from(TransferRequests).where({ ID: transferID })
    );

    if (!transfer) {
        return req.reject(404, 'Transfer request not found');
    }

    if (transfer.status !== 'PICKING') {
        return req.reject(400, 'Transfer must be in PICKING status');
    }

    const item = await tx.run(
        SELECT.one.from(TransferItems).where({
            ID: itemID,
            transfer_ID: transferID
        })
    );

    if (!item) {
        return req.reject(404, 'Transfer item not found');
    }

    const remainingQty = Number(item.requestedQty) -
        Number(item.dispatchedQty);

    if (remainingQty <= 0 || qty > remainingQty) {
        return req.reject(400, 'Dispatch quantity exceeds remaining quantity');
    }

    if (qty < remainingQty && (!reason || !reason.trim() || !expectedDate)) {
        return req.reject(400, 'Reason and expected date are required for partial dispatch');
    }

    // 3. Get eligible reservations for this item
    const reservations = await tx.run(
        SELECT.from(Reservations)
            .where({
                requirementReference: transfer.transferNumber,
                material_ID: item.material_ID,
                plant_ID: transfer.sourcePlant_ID,
                storageLocation_ID: transfer.sourceStorageLocation_ID,
                batchNumber: item.batchNumber,
                status: { in: ['ACTIVE', 'PARTIALLY_RELEASED'] }
            })
            .forUpdate()
    );

    if (!reservations.length) {
        return req.reject(400, 'No active reservation found');
    }

    // 4. Allocate dispatch quantity
    let pendingQty = qty;
    const allocations = [];
    const stockTotals = {};

    for (const reservation of reservations) {

        if (pendingQty <= 0) break;

        const availableQty = Number(reservation.reservedQty) -
            Number(reservation.releasedQty) -
            Number(reservation.consumedQty);

        if (availableQty <= 0) continue;

        const allocatedQty = Math.min(availableQty, pendingQty);

        const stock = await tx.run(
            SELECT.one.from(StockBalances).where({
                material_ID: reservation.material_ID,
                plant_ID: reservation.plant_ID,
                storageLocation_ID: reservation.storageLocation_ID,
                storageBin_ID: reservation.storageBin_ID,
                batchNumber: reservation.batchNumber
            }).forUpdate()
        );

        if (!stock || Number(stock.reservedQty) < allocatedQty ||
            Number(stock.unrestrictedQty) < allocatedQty) {
            return req.reject(400, 'Insufficient source stock in storage bin');
        }

        allocations.push({ reservation, stock, allocatedQty });

        stockTotals[stock.ID] =
            (stockTotals[stock.ID] || 0) + allocatedQty;

        pendingQty -= allocatedQty;
    }

    if (pendingQty > 0) {
        return req.reject(400, 'Insufficient reserved quantity for dispatch');
    }

    // 5. Update stock balances
 // 5. Update stock balances
for (const stockID in stockTotals) {

    const dispatchedQty = stockTotals[stockID];

    await tx.run(
        UPDATE('interplant.StockBalances')
            .set({
                unrestrictedQty: { '-=': dispatchedQty },
                reservedQty: { '-=': dispatchedQty }
            })
            .where({ ID: stockID })
    );
}

    // 6. Update reservations
    for (const allocation of allocations) {

        const reservation = allocation.reservation;
        const consumedQty = Number(reservation.consumedQty) +
            allocation.allocatedQty;

        const releasedQty = Number(reservation.releasedQty);
        const reservedQty = Number(reservation.reservedQty);

        let status = 'ACTIVE';

        if (consumedQty >= reservedQty) {
            status = 'CONSUMED';
        } else if (consumedQty + releasedQty >= reservedQty) {
            status = 'RELEASED';
        } else if (releasedQty > 0) {
            status = 'PARTIALLY_RELEASED';
        }

        await tx.run(
            UPDATE(Reservations)
                .set({
                    consumedQty: consumedQty,
                    status: status
                })
                .where({ ID: reservation.ID })
        );
    }

    // 7. Update transfer item
  // 7. Update transfer item

await tx.run(
    UPDATE(TransferItems)
        .set({
            dispatchedQty: { '+=': qty }
        })
        .where({
            ID: itemID,
            transfer_ID: transferID
        })
);

const updatedItem = await tx.run(
    SELECT.one.from(TransferItems)
        .where({
            ID: itemID,
            transfer_ID: transferID
        })
);

  // 8. Update transfer status

const allItems = await tx.run(
    SELECT.from(TransferItems)
        .where({ transfer_ID: transferID })
);

let allDispatched = true;

for (const transferItem of allItems) {

    const dispatched = Number(transferItem.dispatchedQty);

    if (dispatched < Number(transferItem.requestedQty)) {
        allDispatched = false;
        break;
    }
}

await tx.run(
    UPDATE(TransferRequests)
        .set({
            status: allDispatched ? 'DISPATCHED' : 'PICKING'
        })
        .where({ ID: transferID })
);

    // 9. Create stock movement records
   // 9. Create stock movement records
for (const allocation of allocations) {

    const reservation = allocation.reservation;

    await tx.run(
        INSERT.into(StockMovements).entries({
            material_ID: reservation.material_ID,
            plant_ID: reservation.plant_ID,
            storageLocation_ID: reservation.storageLocation_ID,
            storageBin_ID: reservation.storageBin_ID,
            batchNumber: reservation.batchNumber,
            movementType: 'TRANSFER_DISPATCH',
            stockCategory: 'UNRESTRICTED',
            quantity: allocation.allocatedQty,
            referenceNumber: transfer.transferNumber
        })
    );
}

    // 10. Create audit event
  await tx.run(
    INSERT.into(TransferEvents).entries({
        transfer_ID: transferID,
        eventType: 'TRANSFER_DISPATCHED',
        performedBy: performedBy,
        expectedDate: expectedDate,
        notes: `Item ${itemID}: dispatched ${quantity}. ${reason}`
    })
);

    // 11. Return updated transfer
    return await tx.run(
        SELECT.one.from(TransferRequests).where({ ID: transferID })
    );

});






this.on('receiveTransfer', async (req) => {

    const {
        transferID,
        itemID,
        goodQty,
        damagedQty,
        destinationStorageBinID,
        discrepancyReasonID,
        performedBy
    } = req.data;

    const tx = cds.tx(req);

    // 1. Validate input

    if (!transferID || !itemID || !performedBy ||
        !performedBy.trim() || !destinationStorageBinID) {
        return req.reject(
            400,
            'Transfer, item, destination bin and performedBy are required'
        );
    }

    const good = Number(goodQty);
    const damaged = Number(damagedQty);

    if (
        goodQty === undefined || goodQty === null ||
        damagedQty === undefined || damagedQty === null ||
        !Number.isFinite(good) ||
        !Number.isFinite(damaged) ||
        good < 0 ||
        damaged < 0 ||
        good + damaged <= 0
    ) {
        return req.reject(400, 'Invalid receiving quantities');
    }

    if (damaged > 0 && !discrepancyReasonID) {
        return req.reject(
            400,
            'Discrepancy reason is required for damaged quantity'
        );
    }

    // 2. Find transfer

    const transfer = await tx.run(
        SELECT.one.from(TransferRequests)
            .where({ ID: transferID })
            .forUpdate()
    );

    if (!transfer) {
        return req.reject(404, 'Transfer request not found');
    }

    if (
        transfer.status !== 'PICKING' &&
        transfer.status !== 'DISPATCHED' &&
        transfer.status !== 'PARTIALLY_RECEIVED'
    ) {
        return req.reject(400, 'Transfer is not available for receiving');
    }

    // 3. Find transfer item

    const item = await tx.run(
        SELECT.one.from(TransferItems)
            .where({
                ID: itemID,
                transfer_ID: transferID
            })
            .forUpdate()
    );

    if (!item) {
        return req.reject(404, 'Transfer item not found');
    }

    // 4. Validate remaining dispatched quantity

    const dispatched = Number(item.dispatchedQty || 0);
    const alreadyReceived = Number(item.receivedQty || 0);
    const alreadyDamaged = Number(item.damagedQty || 0);

    const alreadyAccounted = alreadyReceived + alreadyDamaged;
    const remainingQty = dispatched - alreadyAccounted;
    const receivingQty = good + damaged;

    if (remainingQty <= 0) {
        return req.reject(
            400,
            `No dispatched quantity remaining. Dispatched: ${dispatched}, Received: ${alreadyReceived}, Damaged: ${alreadyDamaged}, Remaining: ${remainingQty}`
        );
    }

    if (receivingQty > remainingQty) {
        return req.reject(
            400,
            `Receiving quantity exceeds remaining dispatched quantity. Remaining: ${remainingQty}, Requested: ${receivingQty}`
        );
    }

    // 5. Validate destination storage bin

    const destinationBin = await tx.run(
        SELECT.one.from('interplant.StorageBins')
            .where({
                ID: destinationStorageBinID,
                storageLocation_ID: transfer.destinationStorageLocation_ID
            })
    );

    if (!destinationBin) {
        return req.reject(400, 'Invalid destination storage bin');
    }

    // 6. Validate discrepancy reason

    if (damaged > 0) {

        const reason = await tx.run(
            SELECT.one.from('interplant.MovementReasons')
                .where({ ID: discrepancyReasonID })
        );

        if (!reason) {
            return req.reject(400, 'Invalid discrepancy reason');
        }

    }

    // 7. Find destination stock balance

    const stock = await tx.run(
        SELECT.one.from('interplant.StockBalances')
            .where({
                material_ID: item.material_ID,
                plant_ID: transfer.destinationPlant_ID,
                storageLocation_ID: transfer.destinationStorageLocation_ID,
                storageBin_ID: destinationStorageBinID,
                batchNumber: item.batchNumber
            })
            .forUpdate()
    );

    // 8. Update or create destination stock

    if (stock) {

        await tx.run(
            UPDATE('interplant.StockBalances')
                .set({
                    unrestrictedQty: { '+=': good },
                    blockedQty: { '+=': damaged }
                })
                .where({ ID: stock.ID })
        );

    } else {

        await tx.run(
            INSERT.into('interplant.StockBalances').entries({
                material_ID: item.material_ID,
                plant_ID: transfer.destinationPlant_ID,
                storageLocation_ID: transfer.destinationStorageLocation_ID,
                storageBin_ID: destinationStorageBinID,
                batchNumber: item.batchNumber,
                unrestrictedQty: good,
                reservedQty: 0,
                qualityQty: 0,
                blockedQty: damaged
            })
        );

    }

   // 9. Create good quantity stock movement

if (good > 0) {

    await tx.run(
        INSERT.into('interplant.StockMovements').entries({
            material_ID: item.material_ID,
            plant_ID: transfer.destinationPlant_ID,
            storageLocation_ID: transfer.destinationStorageLocation_ID,
            storageBin_ID: destinationStorageBinID,
            batchNumber: item.batchNumber,
            movementType: 'TRANSFER_RECEIPT',
            stockCategory: 'UNRESTRICTED',
            quantity: good,
            referenceNumber: transfer.transferNumber
        })
    );

}

// 10. Create damaged quantity stock movement

if (damaged > 0) {

    await tx.run(
        INSERT.into('interplant.StockMovements').entries({
            material_ID: item.material_ID,
            plant_ID: transfer.destinationPlant_ID,
            storageLocation_ID: transfer.destinationStorageLocation_ID,
            storageBin_ID: destinationStorageBinID,
            batchNumber: item.batchNumber,
            movementType: 'TRANSFER_RECEIPT',
            stockCategory: 'BLOCKED',
            quantity: damaged,
            movementReason_ID: discrepancyReasonID,
            referenceNumber: transfer.transferNumber
        })
    );

}

    // 11. Update transfer item

    const updatedReceivedQty = alreadyReceived + good;
    const updatedDamagedQty = alreadyDamaged + damaged;

    const itemUpdate = {
        receivedQty: updatedReceivedQty,
        damagedQty: updatedDamagedQty
    };

    if (damaged > 0) {
        itemUpdate.discrepancyReason_ID = discrepancyReasonID;
    }

    await tx.run(
        UPDATE(TransferItems)
            .set(itemUpdate)
            .where({ ID: itemID })
    );

    // 12. Check all transfer items

    const items = await tx.run(
        SELECT.from(TransferItems)
            .where({ transfer_ID: transferID })
    );

    let fullyReceived = true;

    for (const transferItem of items) {

        const accountedQty =
            Number(transferItem.receivedQty || 0) +
            Number(transferItem.damagedQty || 0);

        if (
            accountedQty < Number(transferItem.requestedQty) ||
            Number(transferItem.dispatchedQty) < Number(transferItem.requestedQty)
        ) {
            fullyReceived = false;
            break;
        }

    }

    // 13. Update transfer status

    await tx.run(
        UPDATE(TransferRequests)
            .set({
                status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
            })
            .where({ ID: transferID })
    );

    // 14. Create transfer audit event

    await tx.run(
        INSERT.into(TransferEvents).entries({
            transfer_ID: transferID,
            eventType: 'TRANSFER_RECEIVED',
            performedBy: performedBy,
            reason_ID: damaged > 0 ? discrepancyReasonID : null,
            notes:
                `Good quantity: ${good}, ` +
                `Damaged quantity: ${damaged}, ` +
                `Destination bin: ${destinationStorageBinID}`
        })
    );

    // 15. Return updated transfer

    return await tx.run(
        SELECT.one.from(TransferRequests)
            .where({ ID: transferID })
    );

});



this.on("rejectTransfer", async (req) => {
    const { transferID, performedBy, reason } = req.data;

    // 1. Validate input parameters
    if (!transferID) {
        return req.error(400, "Transfer ID is required");
    }

    if (!performedBy || !performedBy.trim()) {
        return req.error(400, "Performed by is required");
    }

    if (!reason || !reason.trim()) {
        return req.error(400, "Rejection reason is required");
    }

    // 2. Start transaction
    const tx = cds.tx(req);

    // 3. Check whether transfer exists
    const transfer = await tx.run(
        SELECT.one.from(TransferRequests).where({
            ID: transferID
        })
    );

    if (!transfer) {
        return req.error(404, "Transfer request not found");
    }

    // 4. Validate transfer status
    if (transfer.status !== "PENDING_APPROVAL") {
        return req.error(
            400,
            "Only transfers pending approval can be rejected"
        );
    }

    // 5. Update transfer status
    await tx.run(
        UPDATE(TransferRequests)
            .set({
                status: "REJECTED"
            })
            .where({
                ID: transferID
            })
    );

    // 6. Create rejection event
    await tx.run(
        INSERT.into(TransferEvents).entries({
            transfer_ID: transferID,
            eventType: "TRANSFER_REJECTED",
            performedBy: performedBy.trim(),
            notes: reason.trim()
        })
    );

    // 7. Return updated transfer
    return await tx.run(
        SELECT.one.from(TransferRequests).where({
            ID: transferID
        })
    );
});

console.log('Registering closeTransfer handler');



this.on('closeTransfer', async (req) => {
    const { transferID, performedBy } = req.data;

    if (!transferID) {
        return req.reject(400, 'Transfer ID is required');
    }

    if (!performedBy || !performedBy.trim()) {
        return req.reject(400, 'Performed by is required');
    }

    const tx = cds.tx(req);

    try {
        console.log('closeTransfer handler called');

        // Step 1: Fetch transfer request
        const transfer = await tx.run(
            SELECT.one
                .from(TransferRequests)
                .where({ ID: transferID })
        );

        if (!transfer) {
            return req.reject(404, 'Transfer request not found');
        }

        // Step 2: Validate transfer status
        if (transfer.status !== 'RECEIVED') {
            return req.reject(
                400,
                'Only received transfers can be closed'
            );
        }

        // Step 3: Update transfer status
        await tx.run(
            UPDATE(TransferRequests)
                .set({
                    status: 'CLOSED'
                })
                .where({ ID: transferID })
        );

        // Step 4: Create transfer event
        await tx.run(
            INSERT.into(TransferEvents).entries({
                transfer_ID: transferID,
                eventType: 'TRANSFER_CLOSED',
                performedBy: performedBy.trim(),
                notes: 'Transfer successfully closed'
            })
        );

        // Step 5: Fetch updated transfer
        const updatedTransfer = await tx.run(
            SELECT.one
                .from(TransferRequests)
                .where({ ID: transferID })
        );

        console.log('Transfer successfully closed:', transferID);

        return updatedTransfer;

    } catch (error) {
        console.error('closeTransfer error:', error);
        return req.reject(500, error.message);
    }
});



});