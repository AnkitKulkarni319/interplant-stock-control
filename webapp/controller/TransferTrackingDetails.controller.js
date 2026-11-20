
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast
) {
    "use strict";

    return Controller.extend(
        "interplant.stock.storemanager.storemanager.controller.TransferTrackingDetails",
        {

            onInit: function () {
                this._plantMap = {};
                this._locationMap = {};
                this._materialMap = {};
                this._uomMap = {};

                this._currentTransferID = null;
                this._masterDataLoaded = false;

                this.getView().setModel(
                    new JSONModel({}),
                    "tracking"
                );

                this.getView().setModel(
                    new JSONModel({ items: [] }),
                    "trackingItems"
                );

                this.getView().setModel(
                    new JSONModel({ events: [] }),
                    "trackingEvents"
                );

                var oRouter = this.getOwnerComponent().getRouter();

                oRouter.getRoute("TransferTrackingDetails")
                    .attachPatternMatched(
                        this._onRouteMatched,
                        this
                    );

                this._loadMasterData();
            },

            _readEntitySet: function (sPath, aFields) {
                var oModel = this.getOwnerComponent()
                    .getModel("inventory");

                var oBinding = oModel.bindList(
                    sPath,
                    undefined,
                    undefined,
                    undefined,
                    {
                        $select: aFields
                    }
                );

                return oBinding.requestContexts(0, 1000).then(
                    function (aContexts) {
                        var aResults = [];

                        aContexts.forEach(function (oContext) {
                            aResults.push(oContext.getObject());
                        });

                        return aResults;
                    }
                );
            },

            _loadMasterData: function () {
                var that = this;

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
                        ["ID", "materialCode", "description", "uom_ID"]
                    ),
                    this._readEntitySet(
                        "/UnitsOfMeasure",
                        ["ID", "code"]
                    )
                ]).then(function (aResults) {

                    aResults[0].forEach(function (oPlant) {
                        that._plantMap[oPlant.ID] =
                            oPlant.plantCode + " - " + oPlant.plantName;
                    });

                    aResults[1].forEach(function (oLocation) {
                        that._locationMap[oLocation.ID] =
                            oLocation.locationCode + " - " + oLocation.locationName;
                    });

                    aResults[3].forEach(function (oUom) {
                        that._uomMap[oUom.ID] = oUom.code;
                    });

                    aResults[2].forEach(function (oMaterial) {
                        that._materialMap[oMaterial.ID] = {
                            materialCode: oMaterial.materialCode,
                            description: oMaterial.description,
                            uom: that._uomMap[oMaterial.uom_ID] || ""
                        };
                    });

                    that._masterDataLoaded = true;

                    if (that._currentTransferID) {
                        that._loadTrackingData();
                    }

                }).catch(function (oError) {
                    console.error("Error loading master data:", oError);
                    MessageToast.show("Unable to load tracking master data");
                });
            },

            _onRouteMatched: function (oEvent) {
                this._currentTransferID =
                    oEvent.getParameter("arguments").transferID;

                this._loadTrackingData();
            },

            _loadTrackingData: function () {
                if (!this._currentTransferID || !this._masterDataLoaded) {
                    return;
                }

                this._loadTransferHeader();
                this._loadTransferItems();
                this._loadTransferEvents();
            },

            _loadTransferHeader: function () {
                var that = this;
                var oModel = this.getView().getModel();

                var oBinding = oModel.bindContext(
                    "/TransferRequests(" + this._currentTransferID + ")"
                );

                oBinding.requestObject().then(function (oData) {

                    var oTracking = {
                        transferNumber: oData.transferNumber,
                        sourcePlant: that._plantMap[oData.sourcePlant_ID] ||
                            oData.sourcePlant_ID,
                        sourceStorageLocation:
                            that._locationMap[oData.sourceStorageLocation_ID] ||
                            oData.sourceStorageLocation_ID,
                        destinationPlant:
                            that._plantMap[oData.destinationPlant_ID] ||
                            oData.destinationPlant_ID,
                        destinationStorageLocation:
                            that._locationMap[oData.destinationStorageLocation_ID] ||
                            oData.destinationStorageLocation_ID,
                        status: oData.status
                    };

                    that.getView().getModel("tracking").setData(oTracking);

                }).catch(function (oError) {
                    console.error("Error loading transfer:", oError);
                    MessageToast.show("Unable to load transfer details");
                });
            },

           
_loadTransferItems: function () {
    var that = this;
    var oModel = this.getView().getModel();

    var oBinding = oModel.bindList(
        "/TransferItems",
        undefined,
        undefined,
        [
            new Filter(
                "transfer_ID",
                FilterOperator.EQ,
                this._currentTransferID
            )
        ]
    );

    oBinding.requestContexts(0, 1000).then(function (aContexts) {

        var aItems = [];

        aContexts.forEach(function (oContext) {
            var oItem = oContext.getObject();

            var oMaterial =
                that._materialMap[oItem.material_ID] || {};

            aItems.push({
                materialCode:
                    oMaterial.materialCode || oItem.material_ID,

                materialDescription:
                    oMaterial.description || "",

                uom:
                    oMaterial.uom || "",

                batchNumber:
                    oItem.batchNumber,

                requestedQty:
                    oItem.requestedQty,

                dispatchedQty:
                    oItem.dispatchedQty,

                receivedQty:
                    oItem.receivedQty,

                damagedQty:
                    oItem.damagedQty,

                discrepancyReason:
                    oItem.discrepancyReason || ""
            });
        });

        that.getView().getModel("trackingItems").setData({
            items: aItems
        });

    }).catch(function (oError) {
        console.error("Error loading transfer items:", oError);
        MessageToast.show("Unable to load material tracking");
    });
},


            _loadTransferEvents: function () {
                var that = this;
                var oModel = this.getView().getModel();

                var oBinding = oModel.bindList(
                    "/TransferEvents",
                    undefined,
                    undefined,
                    [
                        new Filter(
                            "transfer_ID",
                            FilterOperator.EQ,
                            this._currentTransferID
                        )
                    ],
                    {
                        $select: [
                            "eventType",
                            "notes",
                            "performedBy",
                            "createdAt"
                        ],
                        $orderby: "createdAt desc"
                    }
                );

                oBinding.requestContexts(0, 1000).then(function (aContexts) {

                    var aEvents = [];

                    aContexts.forEach(function (oContext) {
                        aEvents.push(oContext.getObject());
                    });

                    that.getView().getModel("trackingEvents").setData({
                        events: aEvents
                    });

                }).catch(function (oError) {
                    console.error("Error loading transfer events:", oError);
                    MessageToast.show("Unable to load transfer history");
                });
            },

            onRefresh: function () {
                this._loadTrackingData();
                MessageToast.show("Transfer tracking refreshed");
            },

            onBack: function () {
                this.getOwnerComponent()
                    .getRouter()
                    .navTo("TransferTracking");
            }

        }
    );
});
