
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (
    Controller,
    Filter,
    FilterOperator
) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.TransferApprovals",
        {
            onInit: function () {
                this._plantMap = {};
                this._locationMap = {};

                var oTable = this.byId("approvalTable");
                var oBinding = oTable.getBinding("items");

                if (oBinding) {
                    oBinding.filter([
                        new Filter(
                            "status",
                            FilterOperator.EQ,
                            "PENDING_APPROVAL"
                        )
                    ]);
                }

                this._loadMasterData();
            },

            _readEntitySet: function (sPath, aFields) {
                var oModel =
                    this.getOwnerComponent().getModel("inventory");

                var oBinding = oModel.bindList(
                    sPath,
                    undefined,
                    undefined,
                    undefined,
                    {
                        $select: aFields
                    }
                );

                return oBinding.requestContexts(0, 1000);
            },

            _loadMasterData: function () {
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
                    var aPlants = aResults[0];
                    var aLocations = aResults[1];

                    aPlants.forEach(function (oContext) {
                        var sID = oContext.getProperty("ID");

                        this._plantMap[sID] =
                            oContext.getProperty("plantCode") +
                            " - " +
                            oContext.getProperty("plantName");
                    }.bind(this));

                    aLocations.forEach(function (oContext) {
                        var sID = oContext.getProperty("ID");

                        this._locationMap[sID] =
                            oContext.getProperty("locationCode") +
                            " - " +
                            oContext.getProperty("locationName");
                    }.bind(this));

                    this.onApprovalsUpdateFinished();

                }.bind(this)).catch(function (oError) {
                    console.error(
                        "Unable to load approval master data:",
                        oError
                    );
                });
            },

            onApprovalsUpdateFinished: function () {
                var aItems =
                    this.byId("approvalTable").getItems();

                aItems.forEach(function (oItem) {
                    var oContext =
                        oItem.getBindingContext();

                    if (!oContext) {
                        return;
                    }

                    var aCells = oItem.getCells();

                    var sSourcePlant =
                        oContext.getProperty("sourcePlant_ID");

                    var sSourceLocation =
                        oContext.getProperty("sourceStorageLocation_ID");

                    var sDestinationPlant =
                        oContext.getProperty("destinationPlant_ID");

                    var sDestinationLocation =
                        oContext.getProperty("destinationStorageLocation_ID");

                    if (this._plantMap[sSourcePlant]) {
                        aCells[1].setText(
                            this._plantMap[sSourcePlant]
                        );
                    }

                    if (this._locationMap[sSourceLocation]) {
                        aCells[2].setText(
                            this._locationMap[sSourceLocation]
                        );
                    }

                    if (this._plantMap[sDestinationPlant]) {
                        aCells[3].setText(
                            this._plantMap[sDestinationPlant]
                        );
                    }

                    if (this._locationMap[sDestinationLocation]) {
                        aCells[4].setText(
                            this._locationMap[sDestinationLocation]
                        );
                    }
                }.bind(this));
            },

            onRefresh: function () {
                var oBinding =
                    this.byId("approvalTable").getBinding("items");

                if (oBinding) {
                    oBinding.refresh();
                }
            },

            onViewDetails: function (oEvent) {
                var oContext =
                    oEvent.getSource().getBindingContext();

                var sTransferID =
                    oContext.getProperty("ID");

                this.getOwnerComponent()
                    .getRouter()
                    .navTo("TransferApprovalDetails", {
                        transferID: sTransferID
                    });
            },

            onBack: function () {
                this.getOwnerComponent()
                    .getRouter()
                    .navTo("StoreManagerHome");
            }
        }
    );
});
