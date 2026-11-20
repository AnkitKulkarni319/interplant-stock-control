
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Item",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (
    Controller,
    Item,
    MessageBox,
    MessageToast
) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.TransferItems",
        {

            onInit: function () {

                this._bIsDraft = false;
                this._aStockBalances = [];
                this._aAvailableMaterials = [];

                this.getOwnerComponent().getRouter()
                    .getRoute("TransferItems")
                    .attachPatternMatched(
                        this._onRouteMatched,
                        this
                    );
            },

            // -----------------------------------------
            // Route Matched
            // -----------------------------------------

            _onRouteMatched: function (oEvent) {

                this._sTransferId =
                    oEvent.getParameter("arguments").transferId;

                this._oTransferContext = null;

                this._aStockBalances = [];
                this._aAvailableMaterials = [];

                this.byId("materialSelect").destroyItems();
                this.byId("batchNumber").destroyItems();

                this.byId("materialSelect").setSelectedKey("");
                this.byId("batchNumber").setSelectedKey("");

                this.byId("availableQty").setNumber("0.000");
                this.byId("requestedQty").setValue("");

                this._setEditMode(false, 0);

                this._loadTransfer();
            },

            // -----------------------------------------
            // Edit Mode
            // -----------------------------------------

            _setEditMode: function (bIsDraft, iItemCount) {

                this._bIsDraft = bIsDraft;

                this.byId("materialSelect").setEnabled(bIsDraft);
                this.byId("batchNumber").setEnabled(bIsDraft);
                this.byId("requestedQty").setEnabled(bIsDraft);

                this.byId("addItemButton").setVisible(bIsDraft);
                this.byId("addItemButton").setEnabled(bIsDraft);

                this.byId("submitButton").setVisible(bIsDraft);

                this.byId("submitButton").setEnabled(
                    bIsDraft && iItemCount > 0
                );
            },

            // -----------------------------------------
            // Load Transfer Request
            // -----------------------------------------

            _loadTransfer: function () {

                var oModel =
                    this.getOwnerComponent().getModel();

                var sPath =
                    "/TransferRequests(" + this._sTransferId + ")";

                var oBinding = oModel.bindContext(
                    sPath,
                    null,
                    {
                        $expand: "items"
                    }
                );

                oBinding.requestObject().then(function (oTransfer) {

                    this._oTransferContext =
                        oBinding.getBoundContext();

                    this.getView().setBindingContext(
                        this._oTransferContext
                    );

                    var iItemCount = 0;

                    if (oTransfer.items) {
                        iItemCount = oTransfer.items.length;
                    }

                    var bIsDraft =
                        String(oTransfer.status || "")
                            .trim()
                            .toUpperCase() === "DRAFT";

                    this._setEditMode(
                        bIsDraft,
                        iItemCount
                    );

                    if (bIsDraft) {
                        this._loadSourceStock(oTransfer);
                    }

                }.bind(this)).catch(function (oError) {

                    MessageBox.error(
                        "Unable to load transfer: " +
                        oError.message
                    );

                });
            },

            // -----------------------------------------
            // Load Source Stock
            // -----------------------------------------

            

_loadSourceStock: function (oTransfer) {

    var oInventoryModel =
        this.getOwnerComponent().getModel("inventory");

    if (!oInventoryModel) {
        MessageBox.error("Inventory model is not available.");
        return;
    }

    var oStockBinding =
        oInventoryModel.bindList("/StockBalances");

    oStockBinding.requestContexts(0, 1000)
        .then(function (aContexts) {

            this._aStockBalances = [];

            aContexts.forEach(function (oContext) {

                var oStock = oContext.getObject();

                var bSamePlant =
                    String(oStock.plant_ID) ===
                    String(oTransfer.sourcePlant_ID);

                if (!bSamePlant) {
                    return;
                }

                var nUnrestricted =
                    Number(oStock.unrestrictedQty || 0);

                var nReserved =
                    Number(oStock.reservedQty || 0);

                var nAvailable =
                    nUnrestricted - nReserved;

                if (nAvailable > 0) {

                    oStock.availableQty = nAvailable;

                    this._aStockBalances.push(oStock);
                }

            }.bind(this));

            console.log(
                "Source Plant:",
                oTransfer.sourcePlant_ID
            );

            console.log(
                "Source Storage Location:",
                oTransfer.sourceStorageLocation_ID
            );

            console.log(
                "Available Stock for Source Plant:",
                this._aStockBalances
            );

            this._loadAvailableMaterials();

        }.bind(this))
        .catch(function (oError) {

            console.error(oError);

            MessageBox.error(
                "Unable to load source stock: " +
                oError.message
            );

        });
},



            // -----------------------------------------
            // Load Available Materials
            // -----------------------------------------

            _loadAvailableMaterials: function () {

                var oInventoryModel =
                    this.getOwnerComponent().getModel("inventory");

                var oMaterialBinding =
                    oInventoryModel.bindList("/Materials");

                oMaterialBinding.requestContexts(0, 1000)
                    .then(function (aContexts) {

                        var oSelect =
                            this.byId("materialSelect");

                        oSelect.destroyItems();

                        this._aAvailableMaterials = [];

                        var oMaterialMap = {};

                        aContexts.forEach(function (oContext) {

                            var oMaterial = oContext.getObject();

                            var sMaterialID =
                                String(oMaterial.ID);

                            var bAvailable =
                                this._aStockBalances.some(
                                    function (oStock) {

                                        return String(oStock.material_ID) ===
                                            sMaterialID;

                                    }
                                );

                            if (
                                bAvailable &&
                                !oMaterialMap[sMaterialID]
                            ) {

                                oMaterialMap[sMaterialID] = true;

                                this._aAvailableMaterials.push(oMaterial);

                                oSelect.addItem(new Item({

                                    key: sMaterialID,

                                    text:
                                        oMaterial.materialCode +
                                        " - " +
                                        oMaterial.description

                                }));
                            }

                        }.bind(this));

                        oSelect.setSelectedKey("");

                        console.log(
                            "Available Materials:",
                            this._aAvailableMaterials
                        );

                        console.log(
                            "Material Dropdown Count:",
                            oSelect.getItems().length
                        );

                        if (oSelect.getItems().length === 0) {

                            MessageToast.show(
                                "No materials with available stock found."
                            );
                        }

                    }.bind(this)).catch(function (oError) {

                        MessageBox.error(
                            "Unable to load materials: " +
                            oError.message
                        );

                    });
            },

            // -----------------------------------------
            // Material Selection
            // -----------------------------------------

            onMaterialChange: function () {

                if (!this._bIsDraft) {
                    return;
                }

                var sMaterialID =
                    this.byId("materialSelect").getSelectedKey();

                var oBatchSelect =
                    this.byId("batchNumber");

                oBatchSelect.destroyItems();

                oBatchSelect.setSelectedKey("");

                this.byId("availableQty").setNumber("0.000");

                this.byId("requestedQty").setValue("");

                if (!sMaterialID) {
                    return;
                }

                this._aStockBalances.forEach(function (oStock) {

                    if (
                        String(oStock.material_ID) ===
                        String(sMaterialID)
                    ) {

                        var bAlreadyAdded =
                            oBatchSelect.getItems().some(
                                function (oItem) {

                                    return String(oItem.getKey()) ===
                                        String(oStock.batchNumber);

                                }
                            );

                        if (!bAlreadyAdded) {

                            oBatchSelect.addItem(new Item({

                                key: String(oStock.batchNumber),

                                text: String(oStock.batchNumber)

                            }));
                        }
                    }

                });

                console.log(
                    "Available Batches:",
                    oBatchSelect.getItems()
                );
            },

            // -----------------------------------------
            // Batch Selection
            // -----------------------------------------

            onBatchChange: function () {

                if (!this._bIsDraft) {
                    return;
                }

                var sMaterialID =
                    this.byId("materialSelect").getSelectedKey();

                var sBatch =
                    this.byId("batchNumber").getSelectedKey();

                var nAvailable = 0;

                this._aStockBalances.forEach(function (oStock) {

                    if (
                        String(oStock.material_ID) ===
                            String(sMaterialID) &&
                        String(oStock.batchNumber) ===
                            String(sBatch)
                    ) {

                        nAvailable += Number(oStock.availableQty || 0);
                    }

                });

                this.byId("availableQty").setNumber(
                    nAvailable.toFixed(3)
                );

                this.byId("requestedQty").setValue("");

                console.log(
                    "Selected Material:",
                    sMaterialID
                );

                console.log(
                    "Selected Batch:",
                    sBatch
                );

                console.log(
                    "Available Quantity:",
                    nAvailable
                );
            },

            // -----------------------------------------
            // Add Transfer Item
            // -----------------------------------------

            onAddItem: function () {

                if (!this._bIsDraft) {

                    MessageBox.warning(
                        "Items cannot be added after submission."
                    );

                    return;
                }

                var sMaterial =
                    this.byId("materialSelect").getSelectedKey();

                var sBatch =
                    this.byId("batchNumber").getSelectedKey();

                var sQuantity =
                    this.byId("requestedQty").getValue();

                var nQuantity = Number(sQuantity);

                var nAvailable = Number(
                    this.byId("availableQty").getNumber()
                );

                if (!sMaterial) {

                    MessageBox.warning(
                        "Please select a material."
                    );

                    return;
                }

                if (!sBatch) {

                    MessageBox.warning(
                        "Please select a batch number."
                    );

                    return;
                }

                if (
                    !sQuantity ||
                    !Number.isFinite(nQuantity) ||
                    nQuantity <= 0
                ) {

                    MessageBox.warning(
                        "Please enter a valid requested quantity."
                    );

                    return;
                }

                if (nQuantity > nAvailable) {

                    MessageBox.warning(
                        "Requested quantity cannot exceed available quantity."
                    );

                    return;
                }

                if (!this._oTransferContext) {

                    MessageBox.error(
                        "Transfer details are not loaded."
                    );

                    return;
                }

                var oModel =
                    this.getOwnerComponent().getModel();

                // Create item under the selected transfer request.

                var oItemsBinding = oModel.bindList(
                    "items",
                    this._oTransferContext
                );

                var oCreatedContext = oItemsBinding.create({

                    material_ID: sMaterial,

                    batchNumber: sBatch,

                    requestedQty: nQuantity,

                    dispatchedQty: 0,

                    receivedQty: 0,

                    damagedQty: 0

                });

                oCreatedContext.created().then(function () {

                    MessageToast.show(
                        "Transfer item added successfully."
                    );

                    this.byId("materialSelect").setSelectedKey("");

                    this.byId("batchNumber").destroyItems();

                    this.byId("availableQty").setNumber("0.000");

                    this.byId("requestedQty").setValue("");

                    // Reload transfer to refresh item table and count.

                    this._loadTransfer();

                }.bind(this)).catch(function (oError) {

                    MessageBox.error(
                        "Unable to add transfer item: " +
                        oError.message
                    );

                });
            },

            // -----------------------------------------
            // Submit Transfer
            // -----------------------------------------

            onSubmitTransfer: function () {

                if (!this._bIsDraft) {

                    MessageBox.warning(
                        "This transfer has already been submitted."
                    );

                    return;
                }

                var oItemsBinding =
                    this.byId("itemsTable").getBinding("items");

                if (
                    !oItemsBinding ||
                    oItemsBinding.getLength() === 0
                ) {

                    MessageBox.warning(
                        "Please add at least one item before submitting."
                    );

                    return;
                }

                MessageBox.confirm(
                    "Do you want to submit this transfer for approval?",
                    {
                        title: "Confirm Submission",

                        onClose: function (sAction) {

                            if (sAction !== MessageBox.Action.OK) {
                                return;
                            }

                            this._executeSubmit();

                        }.bind(this)
                    }
                );
            },

            // -----------------------------------------
            // Execute Submit Action
            // -----------------------------------------

            _executeSubmit: function () {

                var oModel =
                    this.getOwnerComponent().getModel();

                var oOperation = oModel.bindContext(
                    "/submitTransfer(...)"
                );

                oOperation.setParameter(
                    "transferID",
                    this._sTransferId
                );

                oOperation.setParameter(
                    "performedBy",
                    "StoreManager"
                );

                oOperation.execute().then(function () {

                    MessageToast.show(
                        "Transfer submitted successfully."
                    );

                    this._loadTransfer();

                }.bind(this)).catch(function (oError) {

                    MessageBox.error(
                        "Unable to submit transfer: " +
                        oError.message
                    );

                });
            },

            // -----------------------------------------
            // Back Navigation
            // -----------------------------------------

            onBack: function () {

                this.getOwnerComponent().getRouter()
                    .navTo("MyTransferRequests");
            }

        }
    );
});
