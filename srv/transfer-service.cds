
using { interplant as db } from '../db/schema';

service TransferService {

    // Transfer Header
    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] },
        { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'StoreManager' }
    ]
    entity TransferRequests as projection on db.TransferRequests;


    // Transfer Items
    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] },
        { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'StoreManager' }
    ]
    entity TransferItems as projection on db.TransferItems;


    // Reservation and Stock Information
    @readonly
    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] }
    ]
    entity Reservations as projection on db.Reservations;

    @readonly
    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] }
    ]
    entity StockBalances as projection on db.StockBalances;


    // Transfer Audit History
    @readonly
    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] }
    ]
    entity TransferEvents as projection on db.TransferEvents;


    // Storage Bins
    @readonly
    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] }
    ]
    entity StorageBins as projection on db.StorageBins;


    // Stock Movements
    @readonly
    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] }
    ]
    entity StockMovements as projection on db.StockMovements;


    // Reservation
    @requires: 'WarehouseOperator'
    action reserve(
        transferID  : UUID,
        itemID      : UUID,
        performedBy : String(100)
    ) returns many Reservations;


    // Transfer Request Lifecycle
    @requires: 'StoreManager'
    action submitTransfer(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;

    @requires: 'StoreManager'
    action approveTransfer(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;

    @requires: 'StoreManager'
    action rejectTransfer(
        transferID  : UUID,
        performedBy : String(100),
        reason      : String(255)
    ) returns TransferRequests;


    // Picking
    @requires: 'WarehouseOperator'
    action startPicking(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;


    // Dispatch
    @requires: 'WarehouseOperator'
    action dispatchTransfer(
        transferID   : UUID,
        itemID       : UUID,
        quantity     : Decimal(15,3),
        performedBy  : String(100),
        reason       : String(255),
        expectedDate : Date
    ) returns TransferRequests;


    // Receipt
    @requires: 'WarehouseOperator'
    action receiveTransfer(
        transferID               : UUID,
        itemID                   : UUID,
        goodQty                  : Decimal(15,3),
        damagedQty               : Decimal(15,3),
        destinationStorageBinID  : UUID,
        discrepancyReasonID      : UUID,
        performedBy              : String(100)
    ) returns TransferRequests;


    // Transfer Completion
    @requires: 'StoreManager'
    action closeTransfer(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;

}
