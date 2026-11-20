
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (
    Controller,
    ODataModel,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox
) {
    "use strict";

    return Controller.extend(
        "warehouse.warehouseoperator.controller.Picking",
        {

            onInit: function () {
                    this._reservationMap = {};
                this._selectedTransferID = null;
                this._selectedSourcePlantID = null;
                this._selectedSourceStorageLocationID = null;
                this._selectedTransfer = null;

                this._plantMap = {};
                this._materialMap = {};
                this._stockMap = {};
                this._plantStockMap = {};

                this._reservationKeys = {};
                this._reservedItems = {};

                var oInventoryModel =
                    this.getView().getModel("inventory");

                if (!oInventoryModel) {

                    oInventoryModel = new ODataModel({
                        serviceUrl: "/odata/v4/inventory/",
                        synchronizationMode: "None",
                        operationMode: "Server",
                        autoExpandSelect: true
                    });

                    this.getView().setModel(
                        oInventoryModel,
                        "inventory"
                    );
                }

                this._loadApprovedTransfers();
                this._loadMasterData();
                this._loadReservations();
            },

            onNavBack: function () {
                window.history.back();
            },

            _loadApprovedTransfers: function () {

                var oTable =
                    this.byId("pickingTransferTable");

                var oBinding =
                    oTable.getBinding("items");

                if (oBinding) {

                    oBinding.filter([
                        new Filter(
                            "status",
                            FilterOperator.EQ,
                            "APPROVED"
                        )
                    ]);
                }
            },

            _loadMasterData: function () {

                var oInventoryModel =
                    this.getView().getModel("inventory");

                var that = this;

                oInventoryModel.bindList("/Plants")
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        that._plantMap = {};

                        aContexts.forEach(function (oContext) {

                            var oPlant = oContext.getObject();

                            if (!oPlant || !oPlant.ID) {
                                return;
                            }

                            that._plantMap[
                                String(oPlant.ID).toLowerCase()
                            ] =
                                (oPlant.plantCode || "") +
                                " - " +
                                (oPlant.plantName || "");
                        });

                        var oTransferTable =
                            that.byId("pickingTransferTable");

                        if (oTransferTable) {

                            var oTransferBinding =
                                oTransferTable.getBinding("items");

                            if (oTransferBinding) {
                                oTransferBinding.refresh();
                            }
                        }

                        that._updateDisplayedNames();
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to load plants: " +
                            oError.message
                        );
                    });

                oInventoryModel.bindList("/Materials")
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        that._materialMap = {};

                        aContexts.forEach(function (oContext) {

                            var oMaterial = oContext.getObject();

                            if (!oMaterial || !oMaterial.ID) {
                                return;
                            }

                            that._materialMap[oMaterial.ID] =
                                oMaterial.materialCode ||
                                oMaterial.code ||
                                oMaterial.ID;
                        });

                        that._updateDisplayedNames();
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to load materials: " +
                            oError.message
                        );
                    });

                oInventoryModel.bindList("/StockBalances")
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        that._stockMap = {};

                        aContexts.forEach(function (oContext) {

                            var oStock = oContext.getObject();

                            if (!oStock) {
                                return;
                            }

                            var sKey =
                                oStock.material_ID + "|" +
                                oStock.batchNumber + "|" +
                                oStock.plant_ID + "|" +
                                oStock.storageLocation_ID;

                            var nAvailable =
                                Number(oStock.unrestrictedQty || 0) -
                                Number(oStock.reservedQty || 0);

                            that._stockMap[sKey] =
                                (that._stockMap[sKey] || 0) +
                                nAvailable;
                        });

                        that._updateDisplayedNames();
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to load stock balances: " +
                            oError.message
                        );
                    });
            },

            _loadReservations: function () {

                var oTransferModel =
                    this.getView().getModel();

                if (!oTransferModel) {
                    return Promise.resolve();
                }

                var that = this;

                return oTransferModel.bindList("/Reservations")
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        that._reservedItems = {};
that._reservationMap = {};
                        aContexts.forEach(function (oContext) {

                            var oReservation =
                                oContext.getObject();

                            if (!oReservation) {
                                return;
                            }

                            var sStatus =
                                oReservation.status;

                            var bActive =
                                sStatus === "ACTIVE" ||
                                sStatus === "PARTIALLY_RELEASED";

                          if (
    bActive &&
    oReservation.transferItem_ID
) {

    var nRemaining =
        Number(oReservation.reservedQty || 0) -
        Number(oReservation.releasedQty || 0) -
        Number(oReservation.consumedQty || 0);

    if (nRemaining > 0) {

        var sItemID =
            oReservation.transferItem_ID;

        that._reservedItems[sItemID] = true;

        that._reservationMap[sItemID] = {
            ID: oReservation.ID,
            remainingQty: nRemaining,
            status: oReservation.status
        };
    }
}
                        });

                        console.log(
                            "Loaded reserved transfer items:",
                            that._reservedItems
                        );

                        that._updateDisplayedNames();
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to load reservations: " +
                            oError.message
                        );
                    });
            },

            formatPlant: function (sPlantID) {

                if (!sPlantID) {
                    return "";
                }

                var sKey =
                    String(sPlantID).toLowerCase();

                return this._plantMap[sKey] ||
                    sPlantID;
            },

            formatMaterial: function (sMaterialID) {

                return this._materialMap[sMaterialID] ||
                    sMaterialID ||
                    "";
            },

           
_getAvailableStock: function (oItem) {

    if (!this._selectedTransfer || !oItem) {
        return 0;
    }

    var sSourcePlantID =
        this._selectedTransfer.sourcePlant_ID;

    if (
        !sSourcePlantID ||
        !oItem.material_ID
    ) {
        return 0;
    }

    var nAvailable = 0;

    var sPrefix =
        oItem.material_ID + "|" +
        oItem.batchNumber + "|" +
        sSourcePlantID + "|";

    Object.keys(this._stockMap).forEach(function (sKey) {

        if (sKey.indexOf(sPrefix) === 0) {
            nAvailable += Number(this._stockMap[sKey] || 0);
        }

    }.bind(this));

    return nAvailable;
},


            _updateDisplayedNames: function () {

                var oTable =
                    this.byId("pickingItemsTable");

                if (!oTable || !this._selectedTransfer) {
                    return;
                }

                var that = this;

                var oSourcePlantText =
                    this.byId("sourcePlantText");

                var oDestinationPlantText =
                    this.byId("destinationPlantText");

                if (oSourcePlantText) {

                    var sSourcePlantName =
                        this._plantMap[
                            String(
                                this._selectedTransfer.sourcePlant_ID
                            ).toLowerCase()
                        ] ||
                        this._selectedTransfer.sourcePlant_ID;

                    oSourcePlantText.setText(sSourcePlantName || "");
                }

                if (oDestinationPlantText) {

                    var sDestinationPlantName =
                        this._plantMap[
                            String(
                                this._selectedTransfer.destinationPlant_ID
                            ).toLowerCase()
                        ] ||
                        this._selectedTransfer.destinationPlant_ID;

                    oDestinationPlantText.setText(
                        sDestinationPlantName || ""
                    );
                }

                var aItems = oTable.getItems();

                aItems.forEach(function (oRow) {

                    var oContext =
                        oRow.getBindingContext();

                    if (!oContext) {
                        return;
                    }

                    var oItem = oContext.getObject();

                    if (!oItem || !oItem.material_ID) {
                        return;
                    }

                    var aCells = oRow.getCells();

                    if (aCells[0]) {

                        var sMaterialName =
                            that._materialMap[oItem.material_ID] ||
                            oItem.material_ID;

                        aCells[0].setText(sMaterialName);
                    }

                    if (aCells[1]) {
                        aCells[1].setText(
                            oItem.batchNumber || ""
                        );
                    }

                    if (aCells[2]) {
                        aCells[2].setText(
                            String(oItem.requestedQty || 0)
                        );
                    }

                    var nAvailable =
                        that._getAvailableStock(oItem);

                    if (aCells[3]) {
                        aCells[3].setText(
                            String(nAvailable)
                        );
                    }

                    var bAlreadyReserved =
                        !!that._reservedItems[oItem.ID];

                    var nRequested =
                        Number(oItem.requestedQty || 0);

                    var bAvailable =
                        nAvailable >= nRequested;

                    if (aCells[4]) {

                        if (bAlreadyReserved) {

                            aCells[4].setText("Reserved");
                            aCells[4].setState("Success");

                        } else {

                            aCells[4].setText(
                                bAvailable
                                    ? "Available"
                                    : "Insufficient Stock"
                            );

                            aCells[4].setState(
                                bAvailable
                                    ? "Success"
                                    : "Error"
                            );
                        }
                    }

                  if (aCells[5]) {

    var oActionBox = aCells[5];

    var aButtons = oActionBox.getItems();

    var oReserveButton = aButtons[0];
    var oReleaseButton = aButtons[1];

    var oReservation =
        that._reservationMap[oItem.ID];

    if (bAlreadyReserved && oReservation) {

        oReserveButton.setVisible(false);
        oReserveButton.setEnabled(false);

        oReleaseButton.setVisible(true);
        oReleaseButton.setEnabled(
            that._selectedTransfer.status === "APPROVED" &&
            oReservation.remainingQty > 0
        );

    } else {

        oReserveButton.setVisible(true);
        oReserveButton.setEnabled(
            bAvailable &&
            nRequested > 0
        );

        oReleaseButton.setVisible(false);
        oReleaseButton.setEnabled(false);
    }
}
                });
            },

            onTransfersUpdateFinished: function () {
                this._updateDisplayedNames();
            },

            onItemsUpdateFinished: function () {
                this._updateDisplayedNames();
            },

            onTransferSelect: function (oEvent) {

                var oSelectedItem =
                    oEvent.getParameter("listItem");

                if (!oSelectedItem) {
                    return;
                }

                var oContext =
                    oSelectedItem.getBindingContext();

                var that = this;

                Promise.all([
                    oContext.requestProperty(
                        "sourceStorageLocation_ID"
                    ),
                    oContext.requestProperty(
                        "sourcePlant_ID"
                    ),
                    oContext.requestProperty(
                        "destinationPlant_ID"
                    )
                ])
                    .then(function (aValues) {

                        var oTransfer =
                            oContext.getObject();

                        that._selectedTransfer =
                            Object.assign({}, oTransfer, {
                                sourceStorageLocation_ID: aValues[0],
                                sourcePlant_ID: aValues[1],
                                destinationPlant_ID: aValues[2]
                            });

                        that._selectedTransferID =
                            oTransfer.ID;

                        that._selectedSourcePlantID =
                            that._selectedTransfer.sourcePlant_ID;

                        that._selectedSourceStorageLocationID =
                            that._selectedTransfer.sourceStorageLocation_ID;

                        console.log(
                            "Selected Transfer:",
                            that._selectedTransfer
                        );

                        that.byId(
                            "pickingItemsTable"
                        ).setBindingContext(oContext);

                        that.byId(
                            "startPickingButton"
                        ).setEnabled(true);

                        MessageToast.show(
                            "Selected transfer: " +
                            oTransfer.transferNumber
                        );

                        that._updateDisplayedNames();
                        that._loadReservations();
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to load transfer source details: " +
                            oError.message
                        );
                    });
            },

            _createIdempotencyKey: function () {

                return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                    .replace(/[xy]/g, function (c) {

                        var r = Math.random() * 16 | 0;

                        var v = c === "x"
                            ? r
                            : (r & 3 | 8);

                        return v.toString(16);
                    });
            },

            onReserveItem: function (oEvent) {

                if (!this._selectedTransferID) {

                    MessageBox.warning(
                        "Please select an approved transfer."
                    );

                    return;
                }

                var oItemContext =
                    oEvent.getSource().getBindingContext();

                if (!oItemContext) {

                    MessageBox.error(
                        "Unable to identify the selected transfer item."
                    );

                    return;
                }

                var oItem =
                    oItemContext.getObject();

                if (!oItem || !oItem.ID) {

                    MessageBox.error(
                        "Transfer item ID is missing."
                    );

                    return;
                }

                if (this._reservedItems[oItem.ID]) {

                    MessageToast.show(
                        "This item is already reserved."
                    );

                    this._updateDisplayedNames();

                    return;
                }

                var nAvailable =
                    this._getAvailableStock(oItem);

                var nRequested =
                    Number(oItem.requestedQty || 0);

                if (nAvailable < nRequested) {

                    MessageBox.warning(
                        "Cannot reserve. Available stock is insufficient " +
                        "at the selected source plant."
                    );

                    return;
                }

                var sItemID = oItem.ID;

                var sKey =
                    this._selectedTransferID + "|" + sItemID;

                if (!this._reservationKeys[sKey]) {

                    this._reservationKeys[sKey] =
                        this._createIdempotencyKey();
                }

                var oButton = oEvent.getSource();

                oButton.setEnabled(false);

                var oTransferModel =
                    this.getView().getModel();

                var oAction =
                    oTransferModel.bindContext("/reserve(...)");

                oAction.setParameter(
                    "transferID",
                    this._selectedTransferID
                );

                oAction.setParameter(
                    "itemID",
                    sItemID
                );

                oAction.setParameter(
                    "performedBy",
                    "WarehouseOperator"
                );

                oAction.setParameter(
                    "idempotencyKey",
                    this._reservationKeys[sKey]
                );

                oAction.execute()
                    .then(function () {

                        MessageToast.show(
                            "Reservation completed successfully."
                        );

                        return Promise.all([
                            this._loadMasterData(),
                            this._loadReservations()
                        ]);

                    }.bind(this))
                    .catch(function (oError) {

                        oButton.setEnabled(true);

                        MessageBox.error(
                            "Reservation failed: " +
                            oError.message
                        );
                    });
            },


            onReleaseReservation: function (oEvent) {

    if (!this._selectedTransferID) {

        MessageBox.warning(
            "Please select an approved transfer."
        );

        return;
    }

    if (
        !this._selectedTransfer ||
        this._selectedTransfer.status !== "APPROVED"
    ) {

        MessageBox.warning(
            "Reservation can only be released before picking starts."
        );

        return;
    }

    var oItemContext =
        oEvent.getSource().getBindingContext();

    if (!oItemContext) {

        MessageBox.error(
            "Unable to identify the transfer item."
        );

        return;
    }

    var oItem =
        oItemContext.getObject();

    var oReservation =
        this._reservationMap[oItem.ID];

    if (!oReservation || !oReservation.ID) {

        MessageBox.error(
            "Active reservation not found for this item."
        );

        return;
    }

    var nQuantity =
        Number(oReservation.remainingQty);

    if (nQuantity <= 0) {

        MessageToast.show(
            "No remaining reserved quantity to release."
        );

        return;
    }

    var that = this;

    MessageBox.confirm(
        "Release " + nQuantity +
        " units of the reservation for " +
        (oItem.batchNumber || oItem.ID) + "?",

        {
            title: "Confirm Reservation Release",

            onClose: function (sAction) {

                if (sAction !== MessageBox.Action.OK) {
                    return;
                }

                var oButton = oEvent.getSource();

                oButton.setEnabled(false);

                var oInventoryModel =
                    that.getView().getModel("inventory");

                var oAction =
                    oInventoryModel.bindContext(
                        "/releaseReservation(...)"
                    );

                oAction.setParameter(
                    "reservationID",
                    oReservation.ID
                );

                oAction.setParameter(
                    "quantity",
                    nQuantity
                );

                oAction.setParameter(
                    "performedBy",
                    "WarehouseOperator"
                );
                oAction.setParameter(
    "idempotencyKey",
    that._createIdempotencyKey()
);

                oAction.execute()
                    .then(function () {

                        MessageToast.show(
                            "Reservation released successfully."
                        );

                        that._loadMasterData();
                        return that._loadReservations();

                    })
                    .catch(function (oError) {

                        oButton.setEnabled(true);

                        MessageBox.error(
                            "Unable to release reservation: " +
                            oError.message
                        );
                    });
            }
        }
    );
},

            onStartPicking: function () {

                if (!this._selectedTransferID) {

                    MessageBox.warning(
                        "Please select an approved transfer."
                    );

                    return;
                }

                var oTransferModel =
                    this.getView().getModel();

                var oAction =
                    oTransferModel.bindContext(
                        "/startPicking(...)"
                    );

                oAction.setParameter(
                    "transferID",
                    this._selectedTransferID
                );

                oAction.setParameter(
                    "performedBy",
                    "WarehouseOperator"
                );

                oAction.execute()
                    .then(function () {

                        MessageToast.show(
                            "Picking started successfully."
                        );

                        this._loadApprovedTransfers();

                    }.bind(this))
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to start picking: " +
                            oError.message
                        );
                    });
            }

        }
    );
});
