sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.StoreManagerHome",
        {
            onCreateTransfer: function () {
                this.getOwnerComponent().getRouter().navTo("CreateTransfer");
            },

            onMyRequests: function () {
                this.getOwnerComponent().getRouter().navTo("MyTransferRequests");
            },

            onApprovals: function () {
                this.getOwnerComponent().getRouter().navTo("TransferApprovals");
            },

            onTracking: function () {
                this.getOwnerComponent().getRouter().navTo("TransferTracking");
            }
        }
    );
});