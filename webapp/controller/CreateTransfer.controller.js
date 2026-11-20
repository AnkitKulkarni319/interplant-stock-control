
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Item",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, Item, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.CreateTransfer",
        {

            onInit: function () {
                this._loadPlants();
            },

            // Load Plants
            _loadPlants: function () {
                var oInventory = this.getOwnerComponent().getModel("inventory");
                var oBinding = oInventory.bindList("/Plants");

                oBinding.requestContexts(0, 100).then(function (aContexts) {
                    var oSource = this.byId("sourcePlant");
                    var oDestination = this.byId("destinationPlant");

                    oSource.destroyItems();
                    oDestination.destroyItems();

                    aContexts.forEach(function (oContext) {
                        var oPlant = oContext.getObject();

                        var oItem = new Item({
                            key: oPlant.ID,
                            text: oPlant.plantCode + " - " + oPlant.plantName
                        });

                        oSource.addItem(oItem);

                        oDestination.addItem(new Item({
                            key: oPlant.ID,
                            text: oPlant.plantCode + " - " + oPlant.plantName
                        }));
                    });

                    console.log("Plants loaded:", aContexts.length);
                    console.log(
                        "Source Plant Dropdown:",
                        oSource.getItems().length
                    );
                    console.log(
                        "Destination Plant Dropdown:",
                        oDestination.getItems().length
                    );

                }.bind(this)).catch(function (oError) {
                    console.error("Plant loading error:", oError);

                    MessageBox.error(
                        "Unable to load plants: " + oError.message
                    );
                });
            },

            // Source Plant Selection
            onSourcePlantChange: function () {
                var sPlantId = this.byId("sourcePlant").getSelectedKey();

                console.log("Selected Source Plant ID:", sPlantId);

                this._loadStorageLocations(
                    sPlantId,
                    "sourceStorage"
                );
            },

            // Destination Plant Selection
            onDestinationPlantChange: function () {
                var sPlantId = this.byId("destinationPlant").getSelectedKey();

                console.log("Selected Destination Plant ID:", sPlantId);

                this._loadStorageLocations(
                    sPlantId,
                    "destinationStorage"
                );
            },

            // Load Storage Locations Based on Selected Plant
            _loadStorageLocations: function (sPlantId, sSelectId) {
                var oSelect = this.byId(sSelectId);
                var oInventory = this.getOwnerComponent().getModel("inventory");

                oSelect.destroyItems();
                oSelect.setSelectedKey("");

                if (!sPlantId) {
                    return;
                }

                var oBinding = oInventory.bindList("/StorageLocations");

                oBinding.requestContexts(0, 100).then(function (aContexts) {
                    console.log(
                        "Storage Locations Retrieved:",
                        aContexts.length
                    );

                    aContexts.forEach(function (oContext) {
                        var oLocation = oContext.getObject();

                        if (String(oLocation.plant_ID) === String(sPlantId)) {
                            oSelect.addItem(new Item({
                                key: oLocation.ID,
                                text: oLocation.locationCode +
                                    " - " + oLocation.locationName
                            }));
                        }
                    });

                    console.log(
                        "Storage Dropdown Items:",
                        oSelect.getItems().length
                    );

                    if (oSelect.getItems().length === 0) {
                        MessageToast.show(
                            "No storage locations found for the selected plant."
                        );
                    }

                }).catch(function (oError) {
                    console.error("Storage location loading error:", oError);

                    MessageBox.error(
                        "Unable to load storage locations: " + oError.message
                    );
                });
            },

            // Create Transfer Request
            onCreateTransfer: function () {
                var sSourcePlant = this.byId("sourcePlant").getSelectedKey();
                var sSourceStorage = this.byId("sourceStorage").getSelectedKey();

                var sDestinationPlant =
                    this.byId("destinationPlant").getSelectedKey();

                var sDestinationStorage =
                    this.byId("destinationStorage").getSelectedKey();

                if (!sSourcePlant || !sSourceStorage ||
                    !sDestinationPlant || !sDestinationStorage) {

                    MessageBox.warning(
                        "Please select all transfer locations."
                    );
                    return;
                }

                if (sSourcePlant === sDestinationPlant) {
                    MessageBox.warning(
                        "Source and destination plants must be different."
                    );
                    return;
                }

                if (sSourceStorage === sDestinationStorage) {
                    MessageBox.warning(
                        "Source and destination storage locations must be different."
                    );
                    return;
                }

                var oModel = this.getOwnerComponent().getModel();
                var oListBinding = oModel.bindList("/TransferRequests");

                var oCreatedContext = oListBinding.create({
                    sourcePlant_ID: sSourcePlant,
                    sourceStorageLocation_ID: sSourceStorage,
                    destinationPlant_ID: sDestinationPlant,
                    destinationStorageLocation_ID: sDestinationStorage,
                    status: "DRAFT"
                });

                oCreatedContext.created().then(function () {
                    MessageBox.success(
                        "Transfer request created successfully.",
                        {
                            onClose: function () {
                                this.onClear();

                                this.getOwnerComponent()
                                    .getRouter()
                                    .navTo("MyTransferRequests");
                            }.bind(this)
                        }
                    );

                }.bind(this)).catch(function (oError) {
                    console.error("Transfer creation error:", oError);

                    MessageBox.error(
                        "Unable to create transfer: " + oError.message
                    );
                });
            },

            // Clear Form
            onClear: function () {
                this.byId("sourcePlant").setSelectedKey("");
                this.byId("sourceStorage").destroyItems();

                this.byId("destinationPlant").setSelectedKey("");
                this.byId("destinationStorage").destroyItems();
            },

            // Back to Home
            onBack: function () {
                this.getOwnerComponent()
                    .getRouter()
                    .navTo("StoreManagerHome");
            }

        }
    );
});
