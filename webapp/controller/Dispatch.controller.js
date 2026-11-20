sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (
    Controller,
    ODataModel,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox
) {
    "use strict";

    return Controller.extend(
        "warehouse.warehouseoperator.controller.Dispatch",
        {

            onInit: function () {

                this._selectedTransferID = null;
                this._selectedTransfer = null;
                this._selectedItem = null;

                this._plantMap = {};
                this._materialMap = {};
                this._dispatchKeys = {};

                var oDispatchModel = new JSONModel({
                    transfers: [],
                    items: [],
                    selectedVisible: false
                });

                this.getView().setModel(
                    oDispatchModel,
                    "dispatch"
                );

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

                this._loadMasterData()
                    .then(function () {
                        return this._loadTransfers();
                    }.bind(this))
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to initialize Dispatch page: " +
                            oError.message
                        );
                    });
            },

            // -----------------------------------------
            // Load Plant and Material Master Data
            // -----------------------------------------

            _loadMasterData: function () {

                var oInventoryModel =
                    this.getView().getModel("inventory");

                var that = this;

                return Promise.all([

                    oInventoryModel.bindList("/Plants")
                        .requestContexts(0, 1000)
                        .then(function (aContexts) {

                            that._plantMap = {};

                            aContexts.forEach(function (oContext) {

                                var oPlant = oContext.getObject();

                                that._plantMap[
                                    String(oPlant.ID).toLowerCase()
                                ] =
                                    (oPlant.plantCode || "") +
                                    " - " +
                                    (oPlant.plantName || "");
                            });
                        }),

                    oInventoryModel.bindList("/Materials")
                        .requestContexts(0, 1000)
                        .then(function (aContexts) {

                            that._materialMap = {};

                            aContexts.forEach(function (oContext) {

                                var oMaterial = oContext.getObject();

                                that._materialMap[oMaterial.ID] =
                                    oMaterial.materialCode ||
                                    oMaterial.code ||
                                    oMaterial.ID;
                            });
                        })

                ]);
            },

            // -----------------------------------------
            // Refresh Dispatch Page
            // -----------------------------------------

            loadPage: function () {

                this._loadMasterData()
                    .then(function () {
                        return this._loadTransfers();
                    }.bind(this))
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to refresh Dispatch page: " +
                            oError.message
                        );
                    });
            },

            // -----------------------------------------
            // Load Transfers Ready for Dispatch
            // -----------------------------------------

            _loadTransfers: function () {

                var oTransferModel =
                    this.getView().getModel();

                if (!oTransferModel) {

                    MessageBox.error(
                        "TransferService model is not available."
                    );

                    return Promise.reject(
                        new Error("TransferService model not found")
                    );
                }

            
var oStatusFilter = new Filter({
    filters: [
        new Filter("status", FilterOperator.EQ, "PICKING"),
        new Filter("status", FilterOperator.EQ, "PARTIALLY_DISPATCHED"),
        new Filter("status", FilterOperator.EQ, "PARTIALLY_RECEIVED")
    ],
    and: false
});


                var that = this;

                return oTransferModel
                    .bindList(
                        "/TransferRequests",
                        null,
                        null,
                        [oStatusFilter]
                    )
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        var aPromises = aContexts.map(
                            function (oContext) {

                                return Promise.all([

                                    oContext.requestProperty(
                                        "sourcePlant_ID"
                                    ),

                                    oContext.requestProperty(
                                        "destinationPlant_ID"
                                    )

                                ]).then(function (aValues) {

                                    var oTransfer =
                                        oContext.getObject();

                                    var sSourcePlantID =
                                        aValues[0];

                                    var sDestinationPlantID =
                                        aValues[1];

                                    return {
                                        ID: oTransfer.ID,

                                        transferNumber:
                                            oTransfer.transferNumber,

                                        sourcePlant:
                                            that._plantMap[
                                                String(
                                                    sSourcePlantID
                                                ).toLowerCase()
                                            ] ||
                                            sSourcePlantID,

                                        destinationPlant:
                                            that._plantMap[
                                                String(
                                                    sDestinationPlantID
                                                ).toLowerCase()
                                            ] ||
                                            sDestinationPlantID,

                                        status: oTransfer.status
                                    };
                                });
                            }
                        );

                        return Promise.all(aPromises);
                    })
                    .then(function (aTransfers) {

                        that.getView()
                            .getModel("dispatch")
                            .setProperty(
                                "/transfers",
                                aTransfers
                            );

                        console.log(
                            "Transfers ready for dispatch:",
                            aTransfers
                        );

                        if (
                            that._selectedTransferID &&
                            !aTransfers.some(function (oTransfer) {
                                return oTransfer.ID ===
                                    that._selectedTransferID;
                            })
                        ) {

                            that._selectedTransferID = null;
                            that._selectedTransfer = null;
                            that._selectedItem = null;

                            that.getView()
                                .getModel("dispatch")
                                .setProperty(
                                    "/selectedVisible",
                                    false
                                );

                            that.getView()
                                .getModel("dispatch")
                                .setProperty("/items", []);
                        }
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to load transfers: " +
                            oError.message
                        );

                        throw oError;
                    });
            },

            // -----------------------------------------
            // Select Transfer
            // -----------------------------------------

            onTransferSelect: function (oEvent) {

                var oSelectedItem =
                    oEvent.getParameter("listItem");

                if (!oSelectedItem) {
                    return;
                }

                var oContext =
                    oSelectedItem.getBindingContext("dispatch");

                var oTransfer =
                    oContext.getObject();

                this._selectedTransferID =
                    oTransfer.ID;

                this._selectedTransfer =
                    oTransfer;

                this._selectedItem = null;

                this.getView()
                    .getModel("dispatch")
                    .setProperty(
                        "/selectedVisible",
                        true
                    );

                this.byId("dispatchQty").setValue("");
                this.byId("dispatchReason").setValue("");
                this.byId("expectedDate").setValue("");

                MessageToast.show(
                    "Selected transfer: " +
                    oTransfer.transferNumber
                );

                this._loadTransferItems();
            },

            // -----------------------------------------
            // Load Items of Selected Transfer
            // -----------------------------------------

            _loadTransferItems: function () {

                if (!this._selectedTransferID) {
                    return Promise.resolve();
                }

                var oTransferModel =
                    this.getView().getModel();

                var that = this;

                var oFilter = new Filter(
                    "transfer_ID",
                    FilterOperator.EQ,
                    this._selectedTransferID
                );

                return oTransferModel
                    .bindList(
                        "/TransferItems",
                        null,
                        null,
                        [oFilter]
                    )
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        var aItems = [];

                        aContexts.forEach(function (oContext) {

                            var oItem = oContext.getObject();

                            var nRequested =
                                Number(oItem.requestedQty || 0);

                            var nDispatched =
                                Number(oItem.dispatchedQty || 0);

                            var nRemaining =
                                nRequested - nDispatched;

                            if (nRemaining <= 0) {
                                return;
                            }

                            var sMaterial =
                                that._materialMap[
                                    oItem.material_ID
                                ] ||
                                oItem.material_ID;

                            aItems.push({

                                ID: oItem.ID,

                                material_ID:
                                    oItem.material_ID,

                                material:
                                    sMaterial,

                                batchNumber:
                                    oItem.batchNumber || "",

                                requestedQty:
                                    nRequested,

                                dispatchedQty:
                                    nDispatched,

                                remainingQty:
                                    nRemaining,

                                itemLabel:
                                    sMaterial +
                                    " | Batch: " +
                                    (oItem.batchNumber || "-") +
                                    " | Remaining: " +
                                    nRemaining
                            });
                        });

                        that.getView()
                            .getModel("dispatch")
                            .setProperty(
                                "/items",
                                aItems
                            );

                        var oSelect =
                            that.byId("dispatchItemSelect");

                        if (aItems.length > 0) {

                            oSelect.setSelectedKey(
                                aItems[0].ID
                            );

                            that._updateSelectedItem(
                                aItems[0].ID
                            );

                        } else {

                            that._selectedItem = null;
                            oSelect.setSelectedKey("");

                            MessageToast.show(
                                "No items are remaining for dispatch."
                            );
                        }

                        console.log(
                            "Dispatch items:",
                            aItems
                        );
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Unable to load transfer items: " +
                            oError.message
                        );
                    });
            },

            // -----------------------------------------
            // Select Dispatch Item
            // -----------------------------------------

            onDispatchItemChange: function (oEvent) {

                var sItemID =
                    oEvent.getParameter("selectedItem")
                        ? oEvent.getParameter("selectedItem")
                            .getKey()
                        : "";

                this._updateSelectedItem(sItemID);

                this.byId("dispatchQty").setValue("");
            },

            _updateSelectedItem: function (sItemID) {

                var aItems =
                    this.getView()
                        .getModel("dispatch")
                        .getProperty("/items");

                this._selectedItem = null;

                aItems.forEach(function (oItem) {

                    if (oItem.ID === sItemID) {
                        this._selectedItem = oItem;
                    }

                }.bind(this));
            },

            // -----------------------------------------
            // Generate Idempotency Key
            // -----------------------------------------

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

            // -----------------------------------------
            // Dispatch Transfer Item
            // -----------------------------------------

            onDispatch: function () {

                if (!this._selectedTransferID) {

                    MessageBox.warning(
                        "Please select a transfer."
                    );

                    return;
                }

                if (!this._selectedItem) {

                    MessageBox.warning(
                        "Please select a transfer item."
                    );

                    return;
                }

                var nQuantity =
                    Number(this.byId("dispatchQty").getValue());

                var nRemaining =
                    this._selectedItem.remainingQty;

                var sReason =
                    this.byId("dispatchReason").getValue().trim();

                var sExpectedDate =
                    this.byId("expectedDate").getValue();

                if (
                    !isFinite(nQuantity) ||
                    nQuantity <= 0
                ) {

                    MessageBox.warning(
                        "Please enter a valid dispatch quantity."
                    );

                    return;
                }

                if (nQuantity > nRemaining) {

                    MessageBox.warning(
                        "Dispatch quantity cannot exceed the remaining quantity: " +
                        nRemaining
                    );

                    return;
                }

                // Partial dispatch validation

                if (nQuantity < nRemaining) {

                    if (!sReason) {

                        MessageBox.warning(
                            "Reason is required for partial dispatch."
                        );

                        return;
                    }

                    if (!sExpectedDate) {

                        MessageBox.warning(
                            "Expected arrival date is required for partial dispatch."
                        );

                        return;
                    }
                }

                var oTransferModel =
                    this.getView().getModel();

                var sItemID =
                    this._selectedItem.ID;

                var sKey =
                    this._selectedTransferID +
                    "|" +
                    sItemID +
                    "|" +
                    nQuantity;

                if (!this._dispatchKeys[sKey]) {

                    this._dispatchKeys[sKey] =
                        this._createIdempotencyKey();
                }

                var sIdempotencyKey =
                    this._dispatchKeys[sKey];

                var oAction =
                    oTransferModel.bindContext(
                        "/dispatchTransfer(...)"
                    );

                oAction.setParameter(
                    "transferID",
                    this._selectedTransferID
                );

                oAction.setParameter(
                    "itemID",
                    sItemID
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
                    "reason",
                    sReason
                );

                oAction.setParameter(
                    "expectedDate",
                    sExpectedDate
                );

                oAction.setParameter(
                    "idempotencyKey",
                    sIdempotencyKey
                );

                var that = this;

                // Use the button ID from Dispatch.view.xml
                var oDispatchButton =
                    this.byId("dispatchButton");

                if (oDispatchButton) {
                    oDispatchButton.setEnabled(false);
                }

                oAction.execute()
                    .then(function () {

                        delete that._dispatchKeys[sKey];

                        MessageToast.show(
                            "Dispatch completed successfully."
                        );

                        that.byId("dispatchQty").setValue("");
                        that.byId("dispatchReason").setValue("");
                        that.byId("expectedDate").setValue("");

                        return that._loadTransfers();

                    })
                    .then(function () {

                        if (that._selectedTransferID) {
                            return that._loadTransferItems();
                        }

                        return Promise.resolve();
                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            "Dispatch failed: " +
                            oError.message
                        );
                    })
                    .finally(function () {

                        if (oDispatchButton) {
                            oDispatchButton.setEnabled(true);
                        }
                    });
            }

        }
    );
});