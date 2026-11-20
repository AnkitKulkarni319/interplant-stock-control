sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.App",
        {
            onToggleSideNavigation: function () {
                var oToolPage = this.byId("toolPage");

                oToolPage.setSideExpanded(
                    !oToolPage.getSideExpanded()
                );
            },

            onItemSelect: function (oEvent) {
                var sKey = oEvent.getParameter("item").getKey();
                var oRouter = this.getOwnerComponent().getRouter();

                switch (sKey) {
                    case "home":
                        oRouter.navTo("StoreManagerHome");
                        break;

                    case "createTransfer":
                        oRouter.navTo("CreateTransfer");
                        break;

                    case "myTransferRequests":
                        oRouter.navTo("MyTransferRequests");
                        break;

                    case "transferApprovals":
                        oRouter.navTo("TransferApprovals");
                        break;

                    case "transferTracking":
                        oRouter.navTo("TransferTracking");
                        break;
                }
            }
        }
    );
});