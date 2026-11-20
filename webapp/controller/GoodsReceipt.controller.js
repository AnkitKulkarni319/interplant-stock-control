
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend(
        "warehouse.warehouseoperator.controller.GoodsReceipt",
        {

            onInit: function () {
                var oModel = new JSONModel({
                    transfers: [],
                    items: [],
                    bins: [],
                    reasons: [],
                    selectedVisible: false,
                    canReceiveVisible: false,
                    canCloseVisible: false
                });

                this.getView().setModel(oModel, "receipt");

                this._selectedTransfer = null;

                this.loadPage();
            },

            _get: async function (sUrl) {
                var oResponse = await fetch(sUrl, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    },
                    credentials: "same-origin"
                });

                if (!oResponse.ok) {
                    var sError = await oResponse.text();
                    throw new Error(sError || "Unable to load data");
                }

                return oResponse.json();
            },

            _post: async function (sUrl, oPayload) {
                var oResponse = await fetch(sUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    credentials: "same-origin",
                    body: JSON.stringify(oPayload)
                });

                if (!oResponse.ok) {
                    var sError = await oResponse.text();
                    throw new Error(sError || "Request failed");
                }

                return oResponse.json();
            },

            loadPage: async function () {
                var oModel = this.getView().getModel("receipt");

                try {
                    oModel.setProperty("/selectedVisible", false);
                    oModel.setProperty("/canReceiveVisible", false);
                    oModel.setProperty("/canCloseVisible", false);
                    oModel.setProperty("/items", []);
                    oModel.setProperty("/bins", []);
                    oModel.setProperty("/reasons", []);

                    this._selectedTransfer = null;

                    var sFilter =
                        "status eq 'DISPATCHED' or " +
                        "status eq 'PARTIALLY_DISPATCHED' or " +
                        "status eq 'PARTIALLY_RECEIVED' or " +
                        "status eq 'RECEIVED'";

                    var aResults = await Promise.all([
                        this._get(
                            "/odata/v4/transfer/TransferRequests?$filter=" +
                            encodeURIComponent(sFilter)
                        ),
                        this._get("/odata/v4/inventory/Plants"),
                        this._get("/odata/v4/inventory/StorageLocations")
                    ]);

                    var aTransfers = aResults[0].value || [];
                    var aPlants = aResults[1].value || [];
                    var aLocations = aResults[2].value || [];

                    var mPlants = {};
                    var mLocations = {};

                    aPlants.forEach(function (oPlant) {
                        mPlants[oPlant.ID] =
                            oPlant.plantName ||
                            oPlant.name ||
                            oPlant.plantCode ||
                            oPlant.ID;
                    });

                    aLocations.forEach(function (oLocation) {
                        mLocations[oLocation.ID] =
                            oLocation.storageLocationName ||
                            oLocation.name ||
                            oLocation.storageLocationCode ||
                            oLocation.ID;
                    });

                    aTransfers.forEach(function (oTransfer) {
                        oTransfer.sourcePlant =
                            mPlants[oTransfer.sourcePlant_ID] ||
                            oTransfer.sourcePlant_ID;

                        oTransfer.destinationPlant =
                            mPlants[oTransfer.destinationPlant_ID] ||
                            oTransfer.destinationPlant_ID;

                        oTransfer.sourceStorageLocation =
                            mLocations[oTransfer.sourceStorageLocation_ID] ||
                            oTransfer.sourceStorageLocation_ID;

                        oTransfer.destinationStorageLocation =
                            mLocations[oTransfer.destinationStorageLocation_ID] ||
                            oTransfer.destinationStorageLocation_ID;
                    });

                    oModel.setProperty("/transfers", aTransfers);

                } catch (oError) {
                    console.error("Goods Receipt load error:", oError);
                    MessageBox.error(
                        "Unable to load dispatched transfers: " +
                        oError.message
                    );
                }
            },

            onTransferSelect: async function (oEvent) {
                var oSelectedRow = oEvent.getParameter("listItem");

                if (!oSelectedRow) {
                    return;
                }

                var oTransfer = oSelectedRow
                    .getBindingContext("receipt")
                    .getObject();

                await this._applyTransferSelection(oTransfer);
            },

            _applyTransferSelection: async function (oTransfer) {
                var oModel = this.getView().getModel("receipt");

                this._selectedTransfer = oTransfer;

                var bReceived =
                    String(oTransfer.status).toUpperCase() === "RECEIVED";

                oModel.setProperty("/selectedVisible", true);
                oModel.setProperty("/canReceiveVisible", !bReceived);
                oModel.setProperty("/canCloseVisible", bReceived);

                oModel.setProperty("/items", []);
                oModel.setProperty("/bins", []);
                oModel.setProperty("/reasons", []);

                // A received transfer must only show the Close Transfer button.
                if (bReceived) {
                    return;
                }

                try {
                    var aResults = await Promise.all([
                        this._get(
                            "/odata/v4/transfer/TransferItems?$filter=" +
                            encodeURIComponent(
                                "transfer_ID eq " + oTransfer.ID
                            )
                        ),
                        this._get(
                            "/odata/v4/inventory/Materials"
                        ),
                        this._get(
                            "/odata/v4/inventory/StorageBins?$filter=" +
                            encodeURIComponent(
                                "storageLocation_ID eq " +
                                oTransfer.destinationStorageLocation_ID
                            )
                        ),
                        this._get(
                            "/odata/v4/inventory/MovementReasons"
                        )
                    ]);

                    var aItems = aResults[0].value || [];
                    var aMaterials = aResults[1].value || [];
                    var aBins = aResults[2].value || [];
                    var aReasons = aResults[3].value || [];

                    var mMaterials = {};

                    aMaterials.forEach(function (oMaterial) {
                        mMaterials[oMaterial.ID] =
                            oMaterial.materialCode ||
                            oMaterial.code ||
                            oMaterial.name ||
                            oMaterial.description ||
                            oMaterial.ID;
                    });

                    aItems.forEach(function (oItem) {
                        var sMaterial =
                            mMaterials[oItem.material_ID] ||
                            oItem.material_ID ||
                            "";

                        oItem.itemLabel =
                            sMaterial +
                            " | Batch: " +
                            (oItem.batchNumber || "-") +
                            " | Requested: " +
                            (oItem.requestedQty || 0) +
                            " | Dispatched: " +
                            (oItem.dispatchedQty || 0);
                    });

                    aBins.forEach(function (oBin) {
                        oBin.label =
                            oBin.binCode +
                            " - " +
                            oBin.description;
                    });

                    aReasons.forEach(function (oReason) {
                        oReason.label =
                            oReason.reasonCode ||
                            oReason.code ||
                            oReason.description ||
                            oReason.name ||
                            oReason.ID;
                    });

                    oModel.setProperty("/items", aItems);
                    oModel.setProperty("/bins", aBins);
                    oModel.setProperty("/reasons", aReasons);

                } catch (oError) {
                    console.error("Transfer selection error:", oError);
                    MessageBox.error(
                        "Unable to load transfer details: " +
                        oError.message
                    );
                }
            },

            onReceive: async function () {
                var oView = this.getView();
                var oModel = oView.getModel("receipt");

                if (!this._selectedTransfer) {
                    MessageBox.warning("Please select a transfer.");
                    return;
                }

                if (this._selectedTransfer.status === "RECEIVED") {
                    MessageBox.warning(
                        "This transfer is already received."
                    );
                    return;
                }

                var sItemID = oView.byId("receiptItemSelect").getSelectedKey();
                var sBinID = oView.byId("destinationBinSelect").getSelectedKey();
                var sReasonID = oView.byId("discrepancySelect").getSelectedKey();

                var nGoodQty = Number(oView.byId("goodQty").getValue());
                var nDamagedQty = Number(oView.byId("damagedQty").getValue());

                if (!sItemID) {
                    MessageBox.warning("Please select a transfer item.");
                    return;
                }

                if (!sBinID) {
                    MessageBox.warning(
                        "Please select a destination storage bin."
                    );
                    return;
                }

                if (
                    isNaN(nGoodQty) ||
                    isNaN(nDamagedQty) ||
                    nGoodQty < 0 ||
                    nDamagedQty < 0 ||
                    (nGoodQty + nDamagedQty) <= 0
                ) {
                    MessageBox.warning(
                        "Please enter valid good and damaged quantities."
                    );
                    return;
                }

                var oPayload = {
                    transferID: this._selectedTransfer.ID,
                    itemID: sItemID,
                    goodQty: nGoodQty,
                    damagedQty: nDamagedQty,
                    destinationStorageBinID: sBinID,
                    discrepancyReasonID: sReasonID || null,
                    performedBy: "WarehouseOperator",
                    idempotencyKey: "GR-" + Date.now() + "-" +
                        Math.floor(Math.random() * 100000)
                };

                try {
                    await this._post(
                        "/odata/v4/transfer/receiveTransfer",
                        oPayload
                    );

                    MessageToast.show("Goods receipt recorded successfully.");

                    oView.byId("goodQty").setValue("0");
                    oView.byId("damagedQty").setValue("0");

                    await this._refreshSelectedTransfer();

                } catch (oError) {
                    console.error("Goods receipt error:", oError);
                    MessageBox.error(
                        "Goods receipt failed: " + oError.message
                    );
                }
            },

            _refreshSelectedTransfer: async function () {
                var sTransferID = this._selectedTransfer &&
                    this._selectedTransfer.ID;

                await this.loadPage();

                if (!sTransferID) {
                    return;
                }

                var oModel = this.getView().getModel("receipt");
                var aTransfers = oModel.getProperty("/transfers") || [];

                var oUpdatedTransfer = aTransfers.find(function (oTransfer) {
                    return oTransfer.ID === sTransferID;
                });

                if (oUpdatedTransfer) {
                    await this._applyTransferSelection(oUpdatedTransfer);
                }
            },

            onCloseTransfer: async function () {
                if (!this._selectedTransfer) {
                    MessageBox.warning("Please select a transfer.");
                    return;
                }

                if (this._selectedTransfer.status !== "RECEIVED") {
                    MessageBox.warning(
                        "Only received transfers can be closed."
                    );
                    return;
                }

                var oPayload = {
                    transferID: this._selectedTransfer.ID,
                    performedBy: "WarehouseOperator"
                };

                try {
                    await this._post(
                        "/odata/v4/transfer/closeTransfer",
                        oPayload
                    );

                    MessageToast.show("Transfer closed successfully.");

                    await this.loadPage();

                } catch (oError) {
                    console.error("Close transfer error:", oError);
                    MessageBox.error(
                        "Unable to close transfer: " + oError.message
                    );
                }
            }

        }
    );
});
