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


this.before(['UPDATE', 'DELETE'], 'StockMovements', req => {
    req.reject(403, 'Posted stock movements cannot be modified or deleted. Use reverseMovement instead.');
});

   

this.on('reserve', async (req) => {

    const { transferID, itemID, performedBy, idempotencyKey } = req.data;

    if (!transferID || !itemID || !performedBy || !idempotencyKey) {
        return req.error(400, 'All fields are required');
    }

    const tx = cds.tx(req);

    // 1. Lock transfer request
    const transfer = await tx.run(
        SELECT.one.from(TransferRequests)
            .where({ ID: transferID })
            .forUpdate()
    );

    if (!transfer) {
        return req.error(404, 'Transfer request not found');
    }

    // 2. Lock transfer item
    const item = await tx.run(
        SELECT.one.from(TransferItems)
            .where({
                ID: itemID,
                transfer_ID: transferID
            })
            .forUpdate()
    );

    if (!item) {
        return req.error(404, 'Transfer item not found');
    }

    // 3. Check idempotency event
    const existingEvent = await tx.run(
        SELECT.one.from(TransferEvents)
            .where({ idempotencyKey: idempotencyKey })
    );

    if (existingEvent) {

        if (
            existingEvent.eventType !== 'STOCK_RESERVED' ||
            existingEvent.transfer_ID !== transferID ||
            existingEvent.itemID !== itemID ||
            existingEvent.performedBy !== performedBy ||
            Number(existingEvent.quantity) !== Number(item.requestedQty)
        ) {
            return req.error(
                409,
                'Idempotency key was already used for a different reservation request'
            );
        }

        // Return previously created reservations
        const previousReservations = await tx.run(
            SELECT.from(Reservations)
                .where({ transferItem_ID: itemID })
        );

        if (!previousReservations || previousReservations.length === 0) {
            return req.error(
                409,
                'Reservation audit exists but reservation records were not found'
            );
        }

        return previousReservations;
    }

    // 4. Validate transfer status for a new request
    if (transfer.status !== 'APPROVED') {
        return req.error(400, 'Only approved transfers can be reserved');
    }

    // 5. Check existing reservation
    const existingReservation = await tx.run(
        SELECT.one.from(Reservations)
            .where({ transferItem_ID: itemID })
    );

    if (existingReservation) {
        return req.error(
            409,
            'Reservation already exists for this transfer item'
        );
    }

    if (Number(item.requestedQty) <= 0) {
        return req.error(400, 'Requested quantity must be greater than zero');
    }

    // 6. Lock stock rows in consistent order
    const stockList = await tx.run(
        SELECT.from(StockBalances)
            .where({
                material_ID: item.material_ID,
                plant_ID: transfer.sourcePlant_ID,
                storageLocation_ID: transfer.sourceStorageLocation_ID,
                batchNumber: item.batchNumber
            })
            .orderBy('storageBin_ID')
            .forUpdate()
    );

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

    // 7. Prepare reservation records
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
                transferItem_ID: itemID,
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

    // 8. Insert reservations and update locked stock rows
    for (const reservation of reservationRecords) {

        await tx.run(
            INSERT.into(Reservations).entries(reservation)
        );

        const stock = stockList.find(row =>
            row.storageBin_ID === reservation.storageBin_ID
        );

        await tx.run(
            UPDATE(StockBalances)
                .set({
                    reservedQty: Number(stock.reservedQty) +
                                 Number(reservation.reservedQty)
                })
                .where({ ID: stock.ID })
        );
    }

    // 9. Create idempotency audit event
    await tx.run(
        INSERT.into(TransferEvents).entries({
            transfer_ID: transferID,
            idempotencyKey: idempotencyKey,
            itemID: itemID,
            quantity: Number(item.requestedQty),
            eventType: 'STOCK_RESERVED',
            performedBy: performedBy,
            notes: 'Stock reserved successfully'
        })
    );


    // throw new Error("TEST_ROLLBACK");

    // 10. Return reservations
    return await tx.run(
        SELECT.from(Reservations)
            .where({ transferItem_ID: itemID })
    );

});















    
this.on('startPicking', async (req) => {

    const { transferID, performedBy } = req.data;

    if (!transferID || !performedBy || !performedBy.trim()) {
        return req.reject(400, 'All fields are required');
    }

    const tx = cds.tx(req);

    const transfer = await tx.run(
        SELECT.one.from(TransferRequests).where({ ID: transferID })
    );

    if (!transfer) {
        return req.reject(404, 'Transfer does not exist');
    }

    if (transfer.status !== 'APPROVED') {
        return req.reject(400, 'Transfer must be APPROVED before picking');
    }

    const items = await tx.run(
        SELECT.from(TransferItems).where({ transfer_ID: transferID })
    );

    if (items.length === 0) {
        return req.reject(400, 'Transfer has no items');
    }

    for (const item of items) {

        const reservations = await tx.run(
            SELECT.from(Reservations).where({
                transferItem_ID: item.ID,
                status: { in: ['ACTIVE', 'PARTIALLY_RELEASED'] }
            })
        );

        let totalReserved = 0;

        for (const reservation of reservations) {
            totalReserved +=
                Number(reservation.reservedQty) -
                Number(reservation.releasedQty) -
                Number(reservation.consumedQty);
        }

        if (totalReserved < Number(item.requestedQty)) {
            return req.reject(
                400,
                'Insufficient active reservation for material ' + item.material_ID
            );
        }
    }

    await tx.run(
        UPDATE(TransferRequests)
            .set({ status: 'PICKING' })
            .where({ ID: transferID })
    );

    await tx.run(
        INSERT.into(TransferEvents).entries({
            transfer_ID: transferID,
            eventType: 'PICKING_STARTED',
            performedBy: performedBy,
            notes: 'Picking started'
        })
    );

    return {
        message: 'Picking started successfully'
    };
});





this.on('dispatchTransfer', async (req) => {

    const {
        transferID,
        itemID,
        quantity,
        performedBy,
        reason,
        expectedDate,
        idempotencyKey
    } = req.data;

    if (!transferID || !itemID || !performedBy || !performedBy.trim()) {
        return req.reject(400, 'Required fields are missing');
    }

    if (!idempotencyKey) {
        return req.reject(400, 'Idempotency key is required');
    }

    const dispatchQty = Number(quantity);

    if (!Number.isFinite(dispatchQty) || dispatchQty <= 0) {
        return req.reject(400, 'Dispatch quantity must be greater than zero');
    }

    const tx = cds.tx(req);

    const transfer = await tx.run(
        SELECT.one.from(TransferRequests)
            .where({ ID: transferID })
            .forUpdate()
    );

    if (!transfer) {
        return req.reject(404, 'Transfer does not exist');
    }

    // Check whether this dispatch request was already processed
    const existingEvent = await tx.run(
    SELECT.one.from(TransferEvents)
        .where({ idempotencyKey: idempotencyKey })
);

    if (existingEvent) {

        if (
            existingEvent.transfer_ID !== transferID ||
             existingEvent.itemID !== itemID ||
    Number(existingEvent.quantity) !== dispatchQty ||
            existingEvent.eventType !== 'TRANSFER_DISPATCHED'
        ) {
            return req.reject(
                409,
                'Idempotency key has already been used for another request'
            );
        }

        const existingItem = await tx.run(
            SELECT.one.from(TransferItems)
                .where({
                    ID: itemID,
                    transfer_ID: transferID
                })
        );

        if (!existingItem) {
            return req.reject(404, 'Transfer item does not exist');
        }

        return {
            message: 'Dispatch request was already processed',
            dispatchedQty: dispatchQty,
            totalDispatchedQty: Number(existingItem.dispatchedQty || 0),
            status: transfer.status
        };
    }

    if (
        transfer.status !== 'PICKING' &&
        transfer.status !== 'PARTIALLY_RECEIVED'
    ) {
        return req.reject(
            400,
            'Transfer must be in PICKING or PARTIALLY_RECEIVED status'
        );
    }

    const item = await tx.run(
        SELECT.one.from(TransferItems)
            .where({ ID: itemID, transfer_ID: transferID })
            .forUpdate()
    );

    if (!item) {
        return req.reject(404, 'Transfer item does not exist');
    }

    const requestedQty = Number(item.requestedQty);
    const alreadyDispatched = Number(item.dispatchedQty || 0);
    const remainingQty = requestedQty - alreadyDispatched;

    if (dispatchQty > remainingQty) {
        return req.reject(400, 'Dispatch quantity exceeds remaining quantity');
    }

    if (dispatchQty < remainingQty && (!reason || !expectedDate)) {
        return req.reject(
            400,
            'Reason and expected date are required for partial dispatch'
        );
    }

    const reservations = await tx.run(
        SELECT.from(Reservations)
            .where({
                transferItem_ID: itemID,
                status: { in: ['ACTIVE', 'PARTIALLY_RELEASED'] }
            })
            .orderBy('storageBin_ID')
            .forUpdate()
    );

    let remainingDispatchQty = dispatchQty;
    const allocations = [];

    for (const reservation of reservations) {

        if (remainingDispatchQty <= 0) {
            break;
        }

        const availableReservation =
            Number(reservation.reservedQty) -
            Number(reservation.releasedQty) -
            Number(reservation.consumedQty);

        if (availableReservation <= 0) {
            continue;
        }

        const allocateQty = Math.min(
            availableReservation,
            remainingDispatchQty
        );

        const stock = await tx.run(
            SELECT.one.from(StockBalances)
                .where({
                    material_ID: reservation.material_ID,
                    plant_ID: reservation.plant_ID,
                    storageLocation_ID: reservation.storageLocation_ID,
                    storageBin_ID: reservation.storageBin_ID,
                    batchNumber: reservation.batchNumber
                })
                .forUpdate()
        );

        if (!stock) {
            return req.reject(
                404,
                'Corresponding source stock balance does not exist'
            );
        }

        const stockUnrestrictedQty = Number(stock.unrestrictedQty);
        const stockReservedQty = Number(stock.reservedQty);

        if (
            stockUnrestrictedQty < allocateQty ||
            stockReservedQty < allocateQty
        ) {
            return req.reject(400, 'Insufficient source stock for dispatch');
        }

        await tx.run(
            UPDATE(StockBalances)
                .set({
                    unrestrictedQty: stockUnrestrictedQty - allocateQty,
                    reservedQty: stockReservedQty - allocateQty
                })
                .where({ ID: stock.ID })
        );

        const newConsumedQty =
            Number(reservation.consumedQty) + allocateQty;

        let newReservationStatus = 'PARTIALLY_RELEASED';

        if (
            newConsumedQty + Number(reservation.releasedQty) >=
            Number(reservation.reservedQty)
        ) {
            newReservationStatus = 'CONSUMED';
        } else if (newConsumedQty > 0) {
            newReservationStatus = 'PARTIALLY_RELEASED';
        }

        await tx.run(
            UPDATE(Reservations)
                .set({
                    consumedQty: newConsumedQty,
                    status: newReservationStatus
                })
                .where({ ID: reservation.ID })
        );

        allocations.push({
            reservation: reservation,
            quantity: allocateQty
        });

        remainingDispatchQty -= allocateQty;
    }

    if (remainingDispatchQty > 0) {
        return req.reject(400, 'Insufficient reserved quantity for dispatch');
    }

    const newDispatchedQty = alreadyDispatched + dispatchQty;

    await tx.run(
        UPDATE(TransferItems)
            .set({ dispatchedQty: newDispatchedQty })
            .where({ ID: itemID })
    );

    for (const allocation of allocations) {

        await tx.run(
            INSERT.into(StockMovements).entries({
                material_ID: allocation.reservation.material_ID,
                plant_ID: allocation.reservation.plant_ID,
                storageLocation_ID: allocation.reservation.storageLocation_ID,
                storageBin_ID: allocation.reservation.storageBin_ID,
                batchNumber: allocation.reservation.batchNumber,
                movementType: 'TRANSFER_DISPATCH',
                stockCategory: 'UNRESTRICTED',
                quantity: allocation.quantity,
                referenceNumber: transfer.transferNumber
            })
        );
    }

    // Update transfer status

    const allItems = await tx.run(
        SELECT.from(TransferItems)
            .where({ transfer_ID: transferID })
    );

    let allDispatched = true;
    let allReceived = true;
    let anyReceived = false;

    for (const transferItem of allItems) {

        const requested = Number(transferItem.requestedQty);
        const dispatched = Number(transferItem.dispatchedQty || 0);

        const received = Number(transferItem.receivedQty || 0);
        const damaged = Number(transferItem.damagedQty || 0);

        const accountedQty = received + damaged;

        if (dispatched < requested) {
            allDispatched = false;
        }

        if (accountedQty < requested) {
            allReceived = false;
        }

        if (accountedQty > 0) {
            anyReceived = true;
        }
    }

    let newStatus = 'PICKING';

    if (allDispatched && allReceived) {
        newStatus = 'RECEIVED';
    } else if (anyReceived) {
        newStatus = 'PARTIALLY_RECEIVED';
    } else if (allDispatched) {
        newStatus = 'DISPATCHED';
    }

    await tx.run(
        UPDATE(TransferRequests)
            .set({ status: newStatus })
            .where({ ID: transferID })
    );
   console.log('Dispatch idempotency key:', idempotencyKey);
    await tx.run(
        INSERT.into(TransferEvents).entries({
            idempotencyKey: idempotencyKey,
            transfer_ID: transferID,
              itemID: itemID,
        quantity: dispatchQty,
            eventType: 'TRANSFER_DISPATCHED',
            performedBy: performedBy,
            expectedDate: expectedDate || null,
            notes: reason
                ? 'Dispatched quantity: ' + dispatchQty +
                  '. Partial dispatch reason: ' + reason
                : 'Dispatched quantity: ' + dispatchQty
        })
    );
 
    console.log('Dispatch event inserted with ID:', idempotencyKey);

        //throw new Error("TEST_DISPATCH_ROLLBACK");

    return {
        message: 'Transfer quantity dispatched successfully',
        dispatchedQty: dispatchQty,
        totalDispatchedQty: newDispatchedQty,
        status: newStatus
    };
});



this.on('receiveTransfer', async (req) => {

    const {
        transferID,
        itemID,
        goodQty,
        damagedQty,
        destinationStorageBinID,
        discrepancyReasonID,
        performedBy,
        idempotencyKey
    } = req.data;

    const tx = cds.tx(req);

    // 1. Validate input

    if (!transferID || !itemID || !performedBy ||
        !performedBy.trim() || !destinationStorageBinID ||
        !idempotencyKey) {
        return req.reject(
            400,
            'Transfer, item, destination bin, performedBy and idempotencyKey are required'
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

    const receivingQty = good + damaged;

    // 2. Find transfer and lock it

    const transfer = await tx.run(
        SELECT.one.from(TransferRequests)
            .where({ ID: transferID })
            .forUpdate()
    );

    if (!transfer) {
        return req.reject(404, 'Transfer request not found');
    }

    // 3. Check idempotency key

    const existingEvent = await tx.run(
        SELECT.one.from(TransferEvents)
            .where({ idempotencyKey: idempotencyKey })
    );

    if (existingEvent) {

        const expectedNotes =
            'Good quantity: ' + good +
            ', Damaged quantity: ' + damaged +
            ', Destination bin: ' + destinationStorageBinID +
            ', Discrepancy reason: ' + (discrepancyReasonID || '');

        if (
            existingEvent.transfer_ID !== transferID ||
            existingEvent.itemID !== itemID ||
            Number(existingEvent.quantity) !== receivingQty ||
            existingEvent.eventType !== 'TRANSFER_RECEIVED' ||
            existingEvent.notes !== expectedNotes
        ) {
            return req.reject(
                409,
                'Idempotency key has already been used for another request'
            );
        }

        return await tx.run(
            SELECT.one.from(TransferRequests)
                .where({ ID: transferID })
        );
    }

    // 4. Validate transfer status

    if (
        transfer.status !== 'PICKING' &&
        transfer.status !== 'DISPATCHED' &&
        transfer.status !== 'PARTIALLY_RECEIVED'
    ) {
        return req.reject(400, 'Transfer is not available for receiving');
    }

    // 5. Find transfer item

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

    // 6. Validate remaining dispatched quantity

    const dispatched = Number(item.dispatchedQty || 0);
    const alreadyReceived = Number(item.receivedQty || 0);
    const alreadyDamaged = Number(item.damagedQty || 0);

    const alreadyAccounted = alreadyReceived + alreadyDamaged;
    const remainingQty = dispatched - alreadyAccounted;

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

    // 7. Validate destination storage bin

    const destinationBin = await tx.run(
        SELECT.one.from('interplant.StorageBins')
            .where({
                ID: destinationStorageBinID,
                storageLocation_ID: transfer.destinationStorageLocation_ID
            }).forUpdate()
    );

    if (!destinationBin) {
        return req.reject(400, 'Invalid destination storage bin');
    }

    // 8. Validate discrepancy reason

    if (damaged > 0) {

        const reason = await tx.run(
            SELECT.one.from('interplant.MovementReasons')
                .where({ ID: discrepancyReasonID })
        );

        if (!reason) {
            return req.reject(400, 'Invalid discrepancy reason');
        }
    }

    // 9. Find destination stock balance

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

    // 10. Update or create destination stock

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

    // 11. Create good quantity stock movement

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

    // 12. Create damaged quantity stock movement

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

    // 13. Update transfer item

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

    // 14. Check all transfer items

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

    // 15. Update transfer status

    await tx.run(
        UPDATE(TransferRequests)
            .set({
                status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
            })
            .where({ ID: transferID })
    );

    // 16. Create transfer audit event

    const eventNotes =
        'Good quantity: ' + good +
        ', Damaged quantity: ' + damaged +
        ', Destination bin: ' + destinationStorageBinID +
        ', Discrepancy reason: ' + (discrepancyReasonID || '');

    await tx.run(
        INSERT.into(TransferEvents).entries({
            transfer_ID: transferID,
            idempotencyKey: idempotencyKey,
            itemID: itemID,
            quantity: receivingQty,
            eventType: 'TRANSFER_RECEIVED',
            performedBy: performedBy,
            reason_ID: damaged > 0 ? discrepancyReasonID : null,
            notes: eventNotes
        })
    );
       // throw new Error("TEST_RECEIVE_ROLLBACK");

    // 17. Return updated transfer

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