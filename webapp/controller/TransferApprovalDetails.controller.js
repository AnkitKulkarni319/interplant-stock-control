
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Input",
    "sap/m/Button"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Dialog,
    Input,
    Button
) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.TransferApprovalDetails",
        {
            onInit: function () {
                this._plantMap = {};
                this._locationMap = {};
                this._materialMap = {};
                this._uomMap = {};

                this.getView().setModel(
                    new JSONModel({}),
                    "approval"
                );

                this.getView().setModel(
                    new JSONModel({
                        items: []
                    }),
                    "approvalItems"
                );

                this.getOwnerComponent()
                    .getRouter()
                    .getRoute("TransferApprovalDetails")
                    .attachPatternMatched(
                        this._onRouteMatched,
                        this
                    );

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
                    ),

                    this._readEntitySet(
                        "/Materials",
                        [
                            "ID",
                            "materialCode",
                            "description",
                            "uom_ID"
                        ]
                    ),

                    this._readEntitySet(
                        "/UnitsOfMeasure",
                        ["ID", "code", "description"]
                    )
                ]).then(function (aResults) {

                    aResults[0].forEach(function (oContext) {
                        var sID = oContext.getProperty("ID");

                        this._plantMap[sID] =
                            oContext.getProperty("plantCode") +
                            " - " +
                            oContext.getProperty("plantName");
                    }.bind(this));

                    aResults[1].forEach(function (oContext) {
                        var sID = oContext.getProperty("ID");

                        this._locationMap[sID] =
                            oContext.getProperty("locationCode") +
                            " - " +
                            oContext.getProperty("locationName");
                    }.bind(this));

                    aResults[3].forEach(function (oContext) {
                        var sID = oContext.getProperty("ID");

                        this._uomMap[sID] =
                            oContext.getProperty("code");
                    }.bind(this));

                    aResults[2].forEach(function (oContext) {
                        var sID = oContext.getProperty("ID");
                        var sUomID = oContext.getProperty("uom_ID");

                        this._materialMap[sID] = {
                            materialCode:
                                oContext.getProperty("materialCode"),

                            description:
                                oContext.getProperty("description"),

                            uom: this._uomMap[sUomID] || ""
                        };
                    }.bind(this));

                    this._masterDataLoaded = true;

                    if (this._currentTransferID) {
                        this._loadTransferDetails(
                            this._currentTransferID
                        );

                        this._loadTransferItems(
                            this._currentTransferID
                        );
                    }

                }.bind(this)).catch(function (oError) {
                    MessageBox.error(
                        "Unable to load master data: " +
                        oError.message
                    );
                });
            },

            _onRouteMatched: function (oEvent) {
                var sTransferID =
                    oEvent.getParameter("arguments").transferID;

                this._currentTransferID = sTransferID;

                this.getView()
                    .getModel("approval")
                    .setData({});

                this.getView()
                    .getModel("approvalItems")
                    .setData({
                        items: []
                    });

                this._loadTransferDetails(sTransferID);
                this._loadTransferItems(sTransferID);
            },

            _loadTransferDetails: function (sTransferID) {
                var oModel =
                    this.getOwnerComponent().getModel();

                var oContext = oModel.bindContext(
                    "/TransferRequests(" + sTransferID + ")"
                );

                oContext.requestObject().then(function (oTransfer) {
                    this.getView()
                        .getModel("approval")
                        .setData({
                            ID: oTransfer.ID,
                            transferNumber: oTransfer.transferNumber,

                            sourcePlant: this._plantMap[
                                oTransfer.sourcePlant_ID
                            ] || oTransfer.sourcePlant_ID,

                            sourceStorageLocation: this._locationMap[
                                oTransfer.sourceStorageLocation_ID
                            ] || oTransfer.sourceStorageLocation_ID,

                            destinationPlant: this._plantMap[
                                oTransfer.destinationPlant_ID
                            ] || oTransfer.destinationPlant_ID,

                            destinationStorageLocation: this._locationMap[
                                oTransfer.destinationStorageLocation_ID
                            ] || oTransfer.destinationStorageLocation_ID,

                            status: oTransfer.status
                        });

                }.bind(this)).catch(function (oError) {
                    MessageBox.error(
                        "Unable to load transfer details: " +
                        oError.message
                    );
                });
            },

            _loadTransferItems: function (sTransferID) {
                var oModel =
                    this.getOwnerComponent().getModel();

                var oListBinding = oModel.bindList(
                    "/TransferItems",
                    undefined,
                    undefined,
                    [
                        new Filter(
                            "transfer_ID",
                            FilterOperator.EQ,
                            sTransferID
                        )
                    ],
                    {
                        $select: [
                            "ID",
                            "material_ID",
                            "batchNumber",
                            "requestedQty"
                        ]
                    }
                );

                oListBinding.requestContexts(0, 100)
                    .then(function (aContexts) {
                        var aItems = [];

                        aContexts.forEach(function (oContext) {
                            var sMaterialID =
                                oContext.getProperty("material_ID");

                            var oMaterial =
                                this._materialMap[sMaterialID] || {};

                            aItems.push({
                                ID: oContext.getProperty("ID"),

                                material_ID: sMaterialID,

                                materialCode:
                                    oMaterial.materialCode ||
                                    sMaterialID,

                                materialDescription:
                                    oMaterial.description || "",

                                uom: oMaterial.uom || "",

                                batchNumber:
                                    oContext.getProperty("batchNumber"),

                                requestedQty:
                                    oContext.getProperty("requestedQty")
                            });
                        }.bind(this));

                        this.getView()
                            .getModel("approvalItems")
                            .setProperty("/items", aItems);

                    }.bind(this)).catch(function (oError) {
                        MessageBox.error(
                            "Unable to load requested materials: " +
                            oError.message
                        );
                    });
            },

            onApprove: function () {
                var oApproval =
                    this.getView().getModel("approval");

                var sTransferID =
                    oApproval.getProperty("/ID");

                if (
                    oApproval.getProperty("/status") !==
                    "PENDING_APPROVAL"
                ) {
                    MessageBox.warning(
                        "Only pending approval transfers can be approved."
                    );
                    return;
                }

                MessageBox.confirm(
                    "Do you want to approve this complete transfer?",
                    {
                        title: "Confirm Approval",

                        onClose: function (sAction) {
                            if (sAction !== MessageBox.Action.OK) {
                                return;
                            }

                            this._executeTransferAction(
                                "approveTransfer",
                                sTransferID
                            );
                        }.bind(this)
                    }
                );
            },

            onReject: function () {
                var oApproval =
                    this.getView().getModel("approval");

                var sTransferID =
                    oApproval.getProperty("/ID");

                if (
                    oApproval.getProperty("/status") !==
                    "PENDING_APPROVAL"
                ) {
                    MessageBox.warning(
                        "Only pending approval transfers can be rejected."
                    );
                    return;
                }

                var oReasonInput = new Input({
                    placeholder: "Enter rejection reason",
                    width: "100%",
                    maxLength: 500
                });

                var oDialog = new Dialog({
                    title: "Reject Transfer",
                    contentWidth: "400px",
                    content: [
                        oReasonInput
                    ],

                    beginButton: new Button({
                        text: "Confirm Rejection",
                        type: "Reject",

                        press: function () {
                            var sReason =
                                oReasonInput.getValue().trim();

                            if (!sReason) {
                                MessageBox.warning(
                                    "Rejection reason is required."
                                );
                                return;
                            }

                            oDialog.close();

                            this._executeTransferAction(
                                "rejectTransfer",
                                sTransferID,
                                sReason
                            );
                        }.bind(this)
                    }),

                    endButton: new Button({
                        text: "Cancel",
                        press: function () {
                            oDialog.close();
                        }
                    }),

                    afterClose: function () {
                        oDialog.destroy();
                    }
                });

                oDialog.open();
            },

            _executeTransferAction: function (
                sAction,
                sTransferID,
                sReason
            ) {
                var oModel =
                    this.getOwnerComponent().getModel();

                var oOperation = oModel.bindContext(
                    "/" + sAction + "(...)"
                );

                oOperation.setParameter(
                    "transferID",
                    sTransferID
                );

                oOperation.setParameter(
                    "performedBy",
                    "StoreManager"
                );

                if (sAction === "rejectTransfer") {
                    oOperation.setParameter(
                        "reason",
                        sReason
                    );
                }

                oOperation.execute().then(function () {
                    MessageToast.show(
                        sAction === "approveTransfer"
                            ? "Transfer approved successfully."
                            : "Transfer rejected successfully."
                    );

                    this.getOwnerComponent()
                        .getRouter()
                        .navTo("TransferApprovals");

                }.bind(this)).catch(function (oError) {
                    MessageBox.error(
                        "Unable to process transfer: " +
                        oError.message
                    );
                });
            },

            onBack: function () {
                this.getOwnerComponent()
                    .getRouter()
                    .navTo("TransferApprovals");
            }
        }
    );
});
