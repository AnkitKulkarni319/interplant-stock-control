
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox
) {
    "use strict";

    return Controller.extend(
        "warehouse.warehouseoperator.controller.StockOverview",
        {

            onInit: function () {

                var oStockModel = new JSONModel({
                    rows: []
                });

                this.getView().setModel(
                    oStockModel,
                    "stock"
                );

                this._stockBinding = null;

            },

            // Load stock balances from InventoryService
            loadStock: function () {

                var oInventoryModel =
                    this.getView().getModel("inventory");

                if (!oInventoryModel) {
                    MessageBox.error(
                        "Inventory model is not available."
                    );
                    return;
                }

                if (!this._stockBinding) {

                    this._stockBinding = oInventoryModel.bindList(
                        "/StockBalances",
                        null,
                        null,
                        null,
                        {
                            $expand: {
                                material: {
                                    $select: [
                                        "materialCode",
                                        "description"
                                    ]
                                },
                                plant: {
                                    $select: [
                                        "plantCode",
                                        "plantName"
                                    ]
                                },
                                storageLocation: {
                                    $select: [
                                        "locationCode",
                                        "locationName"
                                    ]
                                }
                            }
                        }
                    );

                } else {

                    this._stockBinding.refresh();

                }

                this._stockBinding.requestContexts(0, 1000)

                    .then(function (aContexts) {

                        var aRows = [];

                        aContexts.forEach(function (oContext) {

                            var oStock = oContext.getObject();

                            var oMaterial = oStock.material || {};
                            var oPlant = oStock.plant || {};
                            var oLocation =
                                oStock.storageLocation || {};

                            var nUnrestricted =
                                Number(oStock.unrestrictedQty) || 0;

                            var nReserved =
                                Number(oStock.reservedQty) || 0;

                            var nAvailable =
                                nUnrestricted - nReserved;

                            aRows.push({

                                material:
                                    oMaterial.materialCode ||
                                    oStock.material_ID,

                                plant:
                                    (oPlant.plantCode || "") +
                                    (oPlant.plantName
                                        ? " - " + oPlant.plantName
                                        : ""),

                                location:
                                    (oLocation.locationCode || "") +
                                    (oLocation.locationName
                                        ? " - " + oLocation.locationName
                                        : ""),

                                batchNumber:
                                    oStock.batchNumber,

                                unrestrictedQty:
                                    nUnrestricted,

                                reservedQty:
                                    nReserved,

                                qualityQty:
                                    Number(oStock.qualityQty) || 0,

                                blockedQty:
                                    Number(oStock.blockedQty) || 0,

                                availableQty:
                                    nAvailable

                            });

                        });

                        this.getView()
                            .getModel("stock")
                            .setProperty("/rows", aRows);

                        MessageToast.show(
                            "Stock balances loaded successfully."
                        );

                    }.bind(this))

                    .catch(function (oError) {

                        console.error(
                            "Stock loading error:",
                            oError
                        );

                        MessageBox.error(
                            "Unable to load stock balances. " +
                            oError.message
                        );

                    });

            }

        }
    );
});
