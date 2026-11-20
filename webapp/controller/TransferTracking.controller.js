
sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.TransferTracking",
        {

            onInit: function () {
                this._plantMap = {};
                this._locationMap = {};

                this._loadMasterData();
            },

            
_readEntitySet: function (sPath, aFields) {
    var oModel = this.getOwnerComponent().getModel("inventory");

    if (!oModel) {
        throw new Error("Inventory model is not available. Check the model name in manifest.json.");
    }

    var oBinding = oModel.bindList(
        sPath,
        undefined,
        undefined,
        undefined,
        {
            $select: aFields
        }
    );

    return oBinding.requestContexts(0, 1000).then(
        function (aContexts) {
            var aResults = [];

            aContexts.forEach(function (oContext) {
                aResults.push(oContext.getObject());
            });

            return aResults;
        }
    );
},


            _loadMasterData: function () {
                var that = this;

                Promise.all([
                    this._readEntitySet(
                        "/Plants",
                        ["ID", "plantCode", "plantName"]
                    ),
                    this._readEntitySet(
                        "/StorageLocations",
                        ["ID", "locationCode", "locationName"]
                    )
                ]).then(function (aResults) {

                    aResults[0].forEach(function (oPlant) {
                        that._plantMap[oPlant.ID] =
                            oPlant.plantCode + " - " + oPlant.plantName;
                    });

                    aResults[1].forEach(function (oLocation) {
                        that._locationMap[oLocation.ID] =
                            oLocation.locationCode + " - " + oLocation.locationName;
                    });

                    that._masterDataLoaded = true;

                    that._updateTrackingDisplay();

                }).catch(function (oError) {
                    console.error(
                        "Error loading tracking master data:",
                        oError
                    );
                });
            },

            onTrackingUpdateFinished: function () {
                this._updateTrackingDisplay();
            },

            _updateTrackingDisplay: function () {
                if (!this._masterDataLoaded) {
                    return;
                }

                var oTable = this.byId("trackingTable");
                var aItems = oTable.getItems();
                var that = this;

                aItems.forEach(function (oItem) {
                    var oContext = oItem.getBindingContext();

                    if (!oContext) {
                        return;
                    }

                    var oData = oContext.getObject();
                    var aCells = oItem.getCells();

                    if (aCells.length < 6) {
                        return;
                    }

                    aCells[1].setText(
                        that._plantMap[oData.sourcePlant_ID] ||
                        oData.sourcePlant_ID ||
                        ""
                    );

                    aCells[2].setText(
                        that._locationMap[oData.sourceStorageLocation_ID] ||
                        oData.sourceStorageLocation_ID ||
                        ""
                    );

                    aCells[3].setText(
                        that._plantMap[oData.destinationPlant_ID] ||
                        oData.destinationPlant_ID ||
                        ""
                    );

                    aCells[4].setText(
                        that._locationMap[oData.destinationStorageLocation_ID] ||
                        oData.destinationStorageLocation_ID ||
                        ""
                    );
                });
            },

            onRefresh: function () {
                this.byId("trackingTable")
                    .getBinding("items")
                    .refresh();
            },

            onBack: function () {
                this.getOwnerComponent()
                    .getRouter()
                    .navTo("StoreManagerHome");
            },

            onViewDetails: function (oEvent) {
    var oContext = oEvent.getSource().getBindingContext();

    var sTransferID = oContext.getProperty("ID");

    this.getOwnerComponent().getRouter().navTo(
        "TransferTrackingDetails",
        {
            transferID: sTransferID
        }
    );
},

        }
    );
});
