
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/format/DateFormat",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, DateFormat, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.MyTransferRequests",
        {

            onInit: function () {
                this._mPlants = {};
                this._mStorageLocations = {};

                this._loadMasterData();
            },

            _normalizeId: function (sId) {
                if (sId === null || sId === undefined) {
                    return "";
                }

                return String(sId).trim().toLowerCase();
            },

            _loadMasterData: function () {
                var oInventoryModel = this.getOwnerComponent()
                    .getModel("inventory");

                if (!oInventoryModel) {
                    MessageBox.error(
                        "Inventory model is not available."
                    );
                    return;
                }

                var oPlantsBinding =
                    oInventoryModel.bindList("/Plants");

                var oLocationsBinding =
                    oInventoryModel.bindList("/StorageLocations");

                Promise.all([
                    oPlantsBinding.requestContexts(0, 1000),
                    oLocationsBinding.requestContexts(0, 1000)
                ]).then(function (aResults) {

                    var aPlantContexts = aResults[0];
                    var aLocationContexts = aResults[1];

                    this._mPlants = {};
                    this._mStorageLocations = {};

                    aPlantContexts.forEach(function (oContext) {
                        var oPlant = oContext.getObject();

                        var sId = this._normalizeId(oPlant.ID);

                        if (sId) {
                            this._mPlants[sId] = oPlant.plantName;
                        }
                    }.bind(this));

                    aLocationContexts.forEach(function (oContext) {
                        var oLocation = oContext.getObject();

                        var sId = this._normalizeId(oLocation.ID);

                        if (sId) {
                            this._mStorageLocations[sId] =
                                oLocation.locationName;
                        }
                    }.bind(this));

                    this._refreshRequestsTable();

                }.bind(this)).catch(function (oError) {
                    MessageBox.error(
                        "Unable to load master data: " +
                        oError.message
                    );
                });
            },

            formatPlantName: function (sPlantId) {
                var sId = this._normalizeId(sPlantId);

                return this._mPlants[sId] || sPlantId || "-";
            },

            formatStorageLocationName: function (sLocationId) {
                var sId = this._normalizeId(sLocationId);

                return this._mStorageLocations[sId] ||
                    sLocationId ||
                    "-";
            },

            _updateRequestDisplayNames: function () {
                var aItems = this.byId("requestsTable").getItems();

                aItems.forEach(function (oItem) {
                    var oContext = oItem.getBindingContext();

                    if (!oContext) {
                        return;
                    }

                    var aCells = oItem.getCells();

                    aCells[1].setText(
                        this._mPlants[
                            this._normalizeId(
                                oContext.getProperty("sourcePlant_ID")
                            )
                        ] || "-"
                    );

                    aCells[2].setText(
                        this._mStorageLocations[
                            this._normalizeId(
                                oContext.getProperty("sourceStorageLocation_ID")
                            )
                        ] || "-"
                    );

                    aCells[3].setText(
                        this._mPlants[
                            this._normalizeId(
                                oContext.getProperty("destinationPlant_ID")
                            )
                        ] || "-"
                    );

                    aCells[4].setText(
                        this._mStorageLocations[
                            this._normalizeId(
                                oContext.getProperty("destinationStorageLocation_ID")
                            )
                        ] || "-"
                    );

                }.bind(this));
            },

            formatCreatedAt: function (vCreatedAt) {
                if (!vCreatedAt) {
                    return "-";
                }

                var oDate = new Date(vCreatedAt);

                if (isNaN(oDate.getTime())) {
                    return "-";
                }

                var oDateFormat = DateFormat.getDateTimeInstance({
                    pattern: "dd-MM-yyyy HH:mm"
                });

                return oDateFormat.format(oDate);
            },

            _refreshRequestsTable: function () {
                var oTable = this.byId("requestsTable");
                var oBinding = oTable.getBinding("items");

                if (oBinding) {
                    oBinding.refresh();
                }
            },

            onRequestsUpdateFinished: function () {
                this._updateRequestDisplayNames();

                var aItems = this.byId("requestsTable").getItems();

                aItems.forEach(function (oItem) {
                    var oContext = oItem.getBindingContext();

                    if (!oContext) {
                        return;
                    }

                    var sStatus = oContext.getProperty("status");
                    var aCells = oItem.getCells();
                    var oManageButton = aCells[7];

                    if (oManageButton) {
                        oManageButton.setVisible(
                            String(sStatus || "").trim().toUpperCase() === "DRAFT"
                        );
                    }
                });
            },

            onRefresh: function () {
                this._loadMasterData();

                MessageToast.show(
                    "Refreshing transfer requests..."
                );
            },

           

            onManageItems: function (oEvent) {
                var oContext =
                    oEvent.getSource().getBindingContext();

                var sId = oContext.getProperty("ID");

                if (oContext.getProperty("status") !== "DRAFT") {
                    MessageBox.warning(
                        "Only DRAFT transfer requests can be managed."
                    );
                    return;
                }

                this.getOwnerComponent()
                    .getRouter()
                    .navTo("TransferItems", {
                        transferId: sId
                    });
            },

            onSelectionChange: function (oEvent) {
                var oItem = oEvent.getParameter("listItem");

                if (oItem) {
                    var sId = oItem.getBindingContext()
                        .getProperty("ID");

                    MessageToast.show(
                        "Selected transfer: " + sId
                    );
                }
            },

            onBack: function () {
                this.getOwnerComponent()
                    .getRouter()
                    .navTo("StoreManagerHome");
            }

        }
    );
});
