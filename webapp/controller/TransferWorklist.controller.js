
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
], (Controller, JSONModel, Filter, FilterOperator, MessageToast) => {
    "use strict";

    return Controller.extend("warehouse.warehouseoperator.controller.TransferWorklist", {

        // Initialize Models
        onInit() {

            const detailsModel = new JSONModel({
                visible: false,
                transferNumber: "",
                status: ""
            });

            this.getView().setModel(detailsModel, "details");

            const itemsModel = new JSONModel({
                items: []
            });

            this.getView().setModel(itemsModel, "transferItems");
        },

        // Handle Transfer Row Selection
        async onTransferSelect(oEvent) {

            const oItem = oEvent.getParameter("listItem");

            if (!oItem) {
                return;
            }

            const oContext = oItem.getBindingContext("worklist");

            if (!oContext) {
                return;
            }

            const selectedTransfer = oContext.getObject();

            console.log("Selected Transfer:", selectedTransfer);

            await this.showSelectedTransfer(selectedTransfer);
        },

        // Display Selected Transfer Details
        async showSelectedTransfer(selectedTransfer) {

            const detailsModel = this.getView().getModel("details");

            detailsModel.setData({
                visible: true,
                ID: selectedTransfer.ID,
                transferNumber: selectedTransfer.transferNumber,
                status: selectedTransfer.status
            });

            await this.loadTransferItems(selectedTransfer.ID);
        },

        // Load Transfer Items for Selected Transfer
        async loadTransferItems(transferID) {

            const itemsModel = this.getView().getModel("transferItems");

            itemsModel.setData({
                items: []
            });

            try {

                const transferModel = this.getView().getModel();
                const inventoryModel = this.getView().getModel("inventory");

                // Load Transfer Items
                const filter = new Filter(
                    "transfer_ID",
                    FilterOperator.EQ,
                    transferID
                );

                const itemContexts = await transferModel
                    .bindList("/TransferItems", null, null, [filter])
                    .requestContexts(0, 100);

                const items = itemContexts.map((context) => {
                    return context.getObject();
                });

                // Load Materials
                const materialContexts = await inventoryModel
                    .bindList("/Materials")
                    .requestContexts(0, 1000);

                const materials = materialContexts.map((context) => {
                    return context.getObject();
                });

                // Material ID to Display Name Mapping
                const materialMap = {};

                materials.forEach((material) => {

                    materialMap[material.ID] =
                        material.materialCode + " - " + material.description;

                });

                // Prepare Transfer Items
                const displayItems = items.map((item) => {

                    return {
                        materialDisplay:
                            materialMap[item.material_ID] || item.material_ID,

                        batchNumber: item.batchNumber,
                        requestedQty: item.requestedQty,
                        dispatchedQty: item.dispatchedQty,
                        receivedQty: item.receivedQty,
                        damagedQty: item.damagedQty
                    };

                });

                console.log("Selected Transfer Items:", displayItems);

                itemsModel.setData({
                    items: displayItems
                });

            } catch (error) {

                console.error("Failed to load Transfer Items:", error);

                MessageToast.show("Failed to load Transfer Items.");

            }
        },

        // Load Transfer Requests
        async loadTransferRequests() {

            console.log("Loading transfer requests...");

            const transferModel = this.getView().getModel();
            const inventoryModel = this.getView().getModel("inventory");

            if (!transferModel || !inventoryModel) {
                MessageToast.show("Transfer or Inventory model is not available.");
                return;
            }

            try {

                // Load Transfer Requests
                const transferContexts = await transferModel
                    .bindList("/TransferRequests")
                    .requestContexts(0, 100);

                // Load Plants
                const plantContexts = await inventoryModel
                    .bindList("/Plants")
                    .requestContexts(0, 100);

                // Load Storage Locations
                const locationContexts = await inventoryModel
                    .bindList("/StorageLocations")
                    .requestContexts(0, 100);

                const transfers = transferContexts.map((context) => {
                    return context.getObject();
                });

                const plants = plantContexts.map((context) => {
                    return context.getObject();
                });

                const locations = locationContexts.map((context) => {
                    return context.getObject();
                });

                // Plant ID to Name Mapping
                const plantMap = {};

                plants.forEach((plant) => {
                    plantMap[plant.ID] = plant.plantName;
                });

                // Storage Location ID to Name Mapping
                const locationMap = {};

                locations.forEach((location) => {
                    locationMap[location.ID] = location.locationName;
                });

                // Prepare Worklist Data
                const worklistData = transfers.map((transfer) => {

                    return {
                        ID: transfer.ID,
                        transferNumber: transfer.transferNumber,
                        status: transfer.status,

                        sourcePlantName:
                            plantMap[transfer.sourcePlant_ID] || transfer.sourcePlant_ID,

                        destinationPlantName:
                            plantMap[transfer.destinationPlant_ID] || transfer.destinationPlant_ID,

                        sourceStorageLocationName:
                            locationMap[transfer.sourceStorageLocation_ID] || transfer.sourceStorageLocation_ID,

                        destinationStorageLocationName:
                            locationMap[transfer.destinationStorageLocation_ID] || transfer.destinationStorageLocation_ID
                    };

                });

                console.log("Mapped Worklist Data:", worklistData);

                const worklistModel = new JSONModel({
                    transfers: worklistData
                });

                this.getView().setModel(worklistModel, "worklist");

            } catch (error) {

                console.error("Failed to load transfer requests:", error);

                MessageToast.show("Failed to refresh Transfer Worklist.");

            }
        }

    });
});
