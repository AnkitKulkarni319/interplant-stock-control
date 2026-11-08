const cds = require('@sap/cds');


module.exports=function(){

const {StockBalances,Materials,Reservations,StockMovements}=this.entities;

    this.on('getAvailableQuantity',async(req)=>{
        const {materialID,plantID,storageLocationID,storageBinID,batchNumber}=req.data;

        if(!materialID || !plantID || !storageBinID || !storageLocationID || !batchNumber)
        {
            return req.error('All Fields are required');
        }

        const stock=await SELECT.one.from(StockBalances).where({
            material_ID:materialID,
            plant_ID:plantID,
            storageLocation_ID:storageLocationID,
            storageBin_ID:storageBinID,
            batchNumber:batchNumber
        })

            if(!stock)
            {
                return req.info("Stock Id does not exist");
            }
            return Number(stock.unrestrictedQty)-Number(stock.reservedQty);

    })




this.on('getLowStock',async(req)=>{
    const stock=await SELECT.from(StockBalances);
    const lowStock=[];

    for(const item of stock){
        const material=await SELECT.one.from(Materials).where({
            ID:item.material_ID
        })
        if(Number(item.unrestrictedQty)<=Number(material.reorderLevel))
        {
            lowStock.push(item);
        }
    }
    return lowStock;
})


  this.on('releaseReservation', async (req) => {

        const {
            reservationID,
            quantity,
            performedBy
        } = req.data;

        // 1. Validate input parameters

        if (!reservationID || !quantity || !performedBy ||
            !performedBy.trim()) {
            return req.reject(400, 'All fields are required');
        }

        const releaseQty = Number(quantity);

        if (!Number.isFinite(releaseQty) || releaseQty <= 0) {
            return req.reject(400,
                'Release quantity must be greater than zero');
        }

        // 2. Start transaction

        const tx = cds.tx(req);

        // 3. Find reservation

        const reservation = await tx.run(
            SELECT.one.from(Reservations).where({
                ID: reservationID
            })
        );

        if (!reservation) {
            return req.reject(404, 'Reservation does not exist');
        }

        // 4. Validate reservation status

        if (reservation.status !== 'ACTIVE' &&
            reservation.status !== 'PARTIALLY_RELEASED') {
            return req.reject(400,
                'Reservation cannot be released in its current status');
        }

        // 5. Calculate releasable quantity

        const reservedQty = Number(reservation.reservedQty);
        const releasedQty = Number(reservation.releasedQty);
        const consumedQty = Number(reservation.consumedQty);

        const releasableQty =
            reservedQty - releasedQty - consumedQty;

        if (releaseQty > releasableQty) {
            return req.reject(400,
                'Release quantity exceeds releasable quantity');
        }

        // 6. Find corresponding stock balance

        const stock = await tx.run(
            SELECT.one.from(StockBalances).where({
                material_ID: reservation.material_ID,
                plant_ID: reservation.plant_ID,
                storageLocation_ID: reservation.storageLocation_ID,
                storageBin_ID: reservation.storageBin_ID,
                batchNumber: reservation.batchNumber
            })
        );

        if (!stock) {
            return req.reject(404,
                'Corresponding stock balance does not exist');
        }

        // 7. Validate available reserved stock

        const stockReservedQty = Number(stock.reservedQty);

        if (stockReservedQty < releaseQty) {
            return req.reject(400,
                'Insufficient reserved stock balance');
        }

        // 8. Calculate updated reservation values

        const newReleasedQty = releasedQty + releaseQty;

        let newStatus = 'PARTIALLY_RELEASED';

        if (newReleasedQty + consumedQty >= reservedQty) {
            newStatus = 'RELEASED';
        }

        // 9. Update reservation

        await tx.run(
            UPDATE(Reservations)
                .set({
                    releasedQty: newReleasedQty,
                    status: newStatus
                })
                .where({
                    ID: reservationID
                })
        );

        // 10. Update stock reserved quantity

        await tx.run(
            UPDATE(StockBalances)
                .set({
                    reservedQty: stockReservedQty - releaseQty
                })
                .where({
                    ID: stock.ID
                })
        );

        // 11. Return updated reservation

        const updatedReservation = await tx.run(
            SELECT.one.from(Reservations).where({
                ID: reservationID
            })
        );

        return updatedReservation;

    });

this.on('reverseMovement', async (req) => {

    const {
        movementID,
        performedBy,
        reason
    } = req.data;

    // 1. Validate input

    if (!movementID || !performedBy || !performedBy.trim() ||
        !reason || !reason.trim()) {
        return req.reject(400, 'All fields are required');
    }

    const tx = cds.tx(req);

    // 2. Find original movement

    const movement = await tx.run(
        SELECT.one.from(StockMovements)
            .where({ ID: movementID })
            .forUpdate()
    );

    if (!movement) {
        return req.reject(404, 'Stock movement does not exist');
    }

    // 3. Check whether movement is already reversed

    const existingReversal = await tx.run(
        SELECT.one.from(StockMovements)
            .where({ reversalOf_ID: movementID })
    );

    if (existingReversal) {
        return req.reject(400, 'Stock movement has already been reversed');
    }

    // 4. Validate movement type

    // 4. Validate movement type

const movementType = movement.movementType;

const validTypes = [
    'RECEIPT',
    'ISSUE',
    'TRANSFER_DISPATCH',
    'TRANSFER_RECEIPT',
    'ADJUSTMENT'
];

if (!validTypes.includes(movementType)) {
    return req.reject(400, 'Movement type cannot be reversed');
}

if (movementType === 'ADJUSTMENT') {
    return req.reject(400,
        'Reversal of ADJUSTMENT movements is not supported');
}

    // 5. Validate stock category

    const stockCategory = movement.stockCategory;
    if (stockCategory === 'RESERVED') {
    return req.reject(400,
        'Reversal of RESERVED stock movements is not supported');
}

    const categoryFields = {
        UNRESTRICTED: 'unrestrictedQty',
        RESERVED: 'reservedQty',
        QUALITY: 'qualityQty',
        BLOCKED: 'blockedQty'
    };

    const stockField = categoryFields[stockCategory];

    if (!stockField) {
        return req.reject(400, 'Invalid stock category');
    }

    // 6. Find corresponding stock balance

    const stock = await tx.run(
        SELECT.one.from(StockBalances)
            .where({
                material_ID: movement.material_ID,
                plant_ID: movement.plant_ID,
                storageLocation_ID: movement.storageLocation_ID,
                storageBin_ID: movement.storageBin_ID,
                batchNumber: movement.batchNumber
            })
            .forUpdate()
    );

    if (!stock) {
        return req.reject(404, 'Corresponding stock balance does not exist');
    }

    // 7. Calculate reversal quantity

    const quantity = Number(movement.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return req.reject(400, 'Invalid original movement quantity');
    }

    let currentQty = Number(stock[stockField]);
    let newQty;

    // 8. Apply opposite stock impact

    if (movementType === 'RECEIPT' ||
        movementType === 'TRANSFER_RECEIPT') {

        newQty = currentQty - quantity;

        if (newQty < 0) {
            return req.reject(400,
                'Insufficient stock to reverse this movement');
        }

    } else {

        newQty = currentQty + quantity;

    }

    // 9. Update stock balance

    const stockUpdate = {};
    stockUpdate[stockField] = newQty;

    await tx.run(
        UPDATE(StockBalances)
            .set(stockUpdate)
            .where({ ID: stock.ID })
    );

    // 10. Create reversal movement record

    await tx.run(
        INSERT.into(StockMovements).entries({
            material_ID: movement.material_ID,
            plant_ID: movement.plant_ID,
            storageLocation_ID: movement.storageLocation_ID,
            storageBin_ID: movement.storageBin_ID,
            batchNumber: movement.batchNumber,
            movementType: 'REVERSAL',
            stockCategory: movement.stockCategory,
            quantity: quantity,
            movementReason_ID: movement.movementReason_ID,
            referenceNumber: movement.referenceNumber,
            reversalOf_ID: movement.ID
        })
    );

    // 11. Return created reversal movement

    const reversal = await tx.run(
        SELECT.one.from(StockMovements)
            .where({ reversalOf_ID: movementID })
    );

    return reversal;

});


}