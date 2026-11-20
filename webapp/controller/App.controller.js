sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/mvc/XMLView",
    "sap/m/MessageBox"
], function (Controller, XMLView, MessageBox) {
    "use strict";

    return Controller.extend(
        "warehouse.warehouseoperator.controller.App",
        {

            onInit: function () {

                this.stockView = null;
                this.transferView = null;
                this.pickingView = null;
                this.dispatchView = null;
                this.receiptView = null;

                this.pageContainer = this.byId("pageContainer");

            },

            onSideNavButtonPress: function () {

                var sideNavigation = this.byId("sideNavigation");

                sideNavigation.setExpanded(
                    !sideNavigation.getExpanded()
                );

            },

            onNavigationItemSelect: function (oEvent) {

                var sKey = oEvent.getParameter("item").getKey();

                var oPageContainer = this.byId("pageContainer");

                if (!oPageContainer) {
                    MessageBox.error(
                        "NavContainer pageContainer was not found."
                    );
                    return;
                }

                if (sKey === "home") {
                    oPageContainer.to(
                        this.byId("homePage").getId()
                    );
                    return;
                }

                var oPageConfig = {
                    stock: {
                        viewName: "StockOverview",
                        property: "stockView",
                        loadFunction: "loadStock"
                    },

                    transfers: {
                        viewName: "TransferWorklist",
                        property: "transferView",
                        loadFunction: "loadTransferRequests"
                    },

                    picking: {
                        viewName: "Picking",
                        property: "pickingView",
                        loadFunction: "_loadApprovedTransfers"
                    },

                    dispatch: {
                        viewName: "Dispatch",
                        property: "dispatchView",
                        loadFunction: "loadPage"
                    },

                    receipt: {
                        viewName: "GoodsReceipt",
                        property: "receiptView",
                        loadFunction: "loadPage"
                    }
                };

                var oSelectedPage = oPageConfig[sKey];

                if (!oSelectedPage) {
                    return;
                }

                var oExistingView = this[oSelectedPage.property];

                if (oExistingView) {

                    oPageContainer.to(oExistingView.getId());

                    return;
                }

                XMLView.create({
                    id: this.getView().createId(
                        oSelectedPage.viewName + "View"
                    ),

                    viewName:
                        "warehouse.warehouseoperator.view." +
                        oSelectedPage.viewName

                }).then(function (oView) {

                    oView.setModel(
                        this.getOwnerComponent().getModel()
                    );

                    oView.setModel(
                        this.getOwnerComponent().getModel("inventory"),
                        "inventory"
                    );

                    this[oSelectedPage.property] = oView;

                    oPageContainer.addPage(oView);

                    oPageContainer.to(oView.getId());

                    var oController = oView.getController();

                    var sLoadFunction = oSelectedPage.loadFunction;

                    if (
                        typeof oController[sLoadFunction] === "function"
                    ) {
                        oController[sLoadFunction]();
                    }

                }.bind(this)).catch(function (oError) {

                    MessageBox.error(
                        "Unable to open " +
                        oSelectedPage.viewName +
                        ": " +
                        oError.message
                    );

                    console.error(oError);

                });

            }

        }
    );
});