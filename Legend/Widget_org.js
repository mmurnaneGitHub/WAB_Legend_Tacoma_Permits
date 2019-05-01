///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 - 2017 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/html',
    'dojo/on',
    './Utils',
        './d3.min', //MJM (from https://d3js.org/) - https://cdnjs.cloudflare.com/ajax/libs/d3/4.13.0/d3.min.js - VERSION 4.13.0
        './d3-dsv.v1.min',  //MJM https://d3js.org/d3-dsv.v1.min.js - d3-dsv for exporting to CSV - use any name below (d3dsv)
        'esri/layers/FeatureLayer',  //MJM
        'esri/Color',  //MJM
        'esri/symbols/SimpleLineSymbol',  //MJM
        'esri/symbols/SimpleMarkerSymbol',  //MJM
        'esri/renderers/SimpleRenderer',  //MJM
        'esri/graphic',  //MJM
        'esri/layers/GraphicsLayer',  //MJM
        'dojo/_base/array',  //MJM
        'esri/InfoTemplate',  //MJM
        'esri/geometry/Point',  //MJM
        'dijit/form/DateTextBox',  //MJM - https://dojotoolkit.org/reference-guide/1.10/dijit/form/DateTextBox.html
        'dijit/form/ComboBox',  //MJM
        'dojo/store/Memory', 'dijit/form/FilteringSelect',  //MJM
        'dijit/form/Button',  //MJM
        'dojox/form/CheckedMultiSelect', //MJM
        'dojo/data/ObjectStore',  //MJM
        'esri/toolbars/draw', //MJM
        'esri/geometry/webMercatorUtils', //MJM
        'esri/symbols/SimpleFillSymbol', //MJM
        'dijit/form/CheckBox', //MJM
        'dijit/form/TextBox',  //MJM
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidget',
    'jimu/LayerInfos/LayerInfos',
    'esri/dijit/Legend'
], function(declare, lang, html, on, legendUtils,
        d3, d3dsv, FeatureLayer, Color, SimpleLineSymbol, SimpleMarkerSymbol, SimpleRenderer, Graphic, 
        GraphicsLayer, array, InfoTemplate, Point, DateTextBox, ComboBox, Memory, FilteringSelect, Button, CheckedMultiSelect, ObjectStore,
        Draw, webMercatorUtils, SimpleFillSymbol, CheckBox, TextBox,  
_WidgetsInTemplateMixin, BaseWidget, LayerInfos, Legend) {

  var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
    name: 'Legend',
    baseClass: 'jimu-widget-legend',
    legend: null,
    _jimuLayerInfos: null,
    _inDrawMode: false, //MJM

    startup: function() {
      this.inherited(arguments);
          
          /* MJM - Add feature layer to map --------------------------------------------------------------
            CivicData Permits Table: http://www.civicdata.com/dataset/masterdata_v11_17284/resource/1cd053ea-736c-4b73-b8e3-f4481b461ba1
            JSON Call (works, text in browser, need limit variable or else get only the first 100 records): 
              http://www.civicdata.com/api/3/action/datastore_search?resource_id=1cd053ea-736c-4b73-b8e3-f4481b461ba1&limit=1000000

            API Call: http://www.civicdata.com/api/action/datastore_search?resource_id=1cd053ea-736c-4b73-b8e3-f4481b461ba1
            OTHER JSON Call (text in browser, first 100 records): http://www.civicdata.com/api/3/action/datastore_search?resource_id=1cd053ea-736c-4b73-b8e3-f4481b461ba1
            OTHER JSON Call (download file in browser): http://www.civicdata.com/datastore/json/1cd053ea-736c-4b73-b8e3-f4481b461ba1/
            CSV Call: http://www.civicdata.com/datastore/dump/1cd053ea-736c-4b73-b8e3-f4481b461ba1

        */ 
          // Use proxy if the server doesn't support CORS
            //esriConfig.defaults.io.proxyUrl = "/website/HistoricMap/proxy/proxy.ashx"; //not working - adding csv to end

      //GLOBAL VARIABLES (no var)
      permitNumberSearch = false; //Update variable for checking if doing a permit number search

         //Modify Widget.html on 'startup' to add query results section (want it below legend, which gets recreated on every open) - MJM
         var newEl = document.createElement('div');
	         newEl.innerHTML = '<div id="queryResults"></div>';
	         this.domNode.parentNode.insertBefore(newEl, this.domNode.nextSibling);
         //End Modify Widget.html -------------------------------------------------------------------------------------------------

         //Polygon layer - Add to map first so appears below permits and allows clicking on single permits
         drawnGraphicsLayer = new GraphicsLayer();   //Layer to hold drawn polygon graphic
         this.map.addLayer(drawnGraphicsLayer);  //Add empty graphics layer to map below the permit layer

          //PERMITS
          //Permit Layer Symbology
          var allPermits = new Color([0, 255, 0, 0.5]); //green
          var marker = new SimpleMarkerSymbol("solid", 25, new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([89,95,35]), 1), allPermits); 
          var renderer = new SimpleRenderer(marker);

          //Popup Template - format https://developers.arcgis.com/javascript/3/jshelp/intro_formatinfowindow.html
          var template = new InfoTemplate("Permit ${Permit_Number}", 
                                            "<b>Address:</b> ${Address_Line_1}" +
                                            "<br> <b>Permit Type: </b> ${Permit_Type_Description}" +
                                            "<br> <b>Current Status: </b> ${Current_Status}" +
                                            "<br> <b>Status Date: </b> ${Status_Date}" +
                                            "<br> <b>Issued Date: </b> ${Issued_Date}" +
                                            "<br> <b>Fee: </b> ${Fees_Paid}" +
                                            "<br> <b>Estimated Value: </b> ${Valuation}" +
                                            "<br> <b>Description:</b> ${Description}" + 
                                            "<br> <a target='_blank' href='${Link}' >More information</a>" +
                                            "<br> <a target='_blank' href='https://wspdsmap.cityoftacoma.org/website/Google/StreetView/?lat=${Latitude}&lon=${Longitude}' >Street View</a>");  //popup template: title, content

          //Create feature collection for data
          var featureCollection = {
              "layerDefinition": {"geometryType": "esriGeometryPoint","objectIdField": "ObjectID", "fields": []},
              "featureSet": {"features": [], "geometryType": "esriGeometryPoint"}
            };
              
          //All Permits - create feature layer based on the feature collection ---------------------------
          featureLayer = new FeatureLayer(featureCollection, {
            infoTemplate: template
          });

            featureLayer.title = 'Permits';  //Legend title          
            featureLayer.setRenderer(renderer);  //Symbol - needs to be done after layer creation
              this.map.addLayers([featureLayer]);  //add the feature layer to the map
          //---------------------------------------------------------------------------------------

          //Get today's date & 30 days ago for initial filtering permits -------------
	        dateToday = new Date();
  	          var dd = dateToday.getDate();
  	          var mm = dateToday.getMonth() + 1; //January is 0!
  	          var yyyy = dateToday.getFullYear();  //Year
  	              if(dd<10) { dd='0'+dd; } 
  	              if(mm<10) { mm='0'+mm; } 
  	              dateTodayCalendar = yyyy+'-'+mm+'-'+dd;  //Today's date formatted for calendar
            dateToday30 = new Date();
              dateToday30.setDate(dateToday30.getDate() - 30);
              var dd = dateToday30.getDate();
              var mm = dateToday30.getMonth() + 1; //January is 0!
              var yyyy = dateToday30.getFullYear();  //Year
                  if(dd<10) { dd='0'+dd; } 
                  if(mm<10) { mm='0'+mm; } 
                  dateToday30Calendar = yyyy+'-'+mm+'-'+dd;  //Date from 30 days ago formatted for calendar
          //End get today's date ---------------------------------------------------- 

       //FILTER----------------------------------------------------------
  		  //Category menu ( https://dojotoolkit.org/reference-guide/1.10/dijit/form/FilteringSelect.html - need 'dojo/store/Memory', 'dijit/form/FilteringSelect')
  		    var categoryStore = new Memory({
  		        data: [
      			{name:"All Categories", id:"All"},
                {name:"Building", id:"Building"},
                {name:"Demolition", id:"Demolition"},
                {name:"Fire", id:"Fire"},
                {name:"Historic", id:"Historic"},
                {name:"Land Use", id:"LandUse"},
                {name:"Mechanical", id:"Mechanical"},
                {name:"Plumbing", id:"Plumbing"},
                {name:"Pre-Application", id:"Pre-Application"},
                {name:"Right-of-Way", id:"ROW"},
                {name:"Sign", id:"Sign"},
                {name:"Site Development", id:"SiteDevelopment"},
                {name:"Special Event", id:"SpecialEvent"},
                {name:"Tree", id:"Tree"},
                {name:"Utility",id:"Utility"}
              ]
  		    });
          var statusStore = new Memory({
              data: [
                {name:"All Status", id:"All"},
                {name:"Application", id:"Application"},
                {name:"Review", id:"Review"},
                {name:"Inspections", id:"Inspections"},
                {name:"Finalized",id:"Finalized"}
              ]
          });

  		    new FilteringSelect({
  		        value: "All",
  		        store: categoryStore,
  		        style: "width: 160px;",
              onChange: lang.hitch(this, this._searchFilter)
  		    }, "categorySelect").startup();

          new FilteringSelect({
              value: "All",  
              store: statusStore,
              style: "width: 160px;",
              onChange: lang.hitch(this, this._searchFilter)
          }, "statusSelect").startup();

          //Start submenus ---------------------------------------------------------------------------------------
          //BUILDING ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Commercial Alteration",
                    label: "Commercial Alteration"
                  },
                  {
                    value: "Commercial New Building",
                    label: "Commercial New Building"
                  },
                  {
                    value: "Residential Alteration",
                    label: "Residential Alteration"
                  },
                  {
                    value: "Residential New Building",
                    label: "Residential New Building"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "BuildingMenu").startup();

          //DEMOLITION ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Commercial",
                    label: "Commercial"
                  },
                  {
                    value: "Residential",
                    label: "Residential"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "DemolitionMenu").startup();

          //FIRE ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Commercial",
                    label: "Commercial"
                  },
                  {
                    value: "Residential",
                    label: "Residential"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "FireMenu").startup();

          //LAND USE ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Application",
                    label: "Application"
                  },
                  {
                    value: "CAPOMM",
                    label: "CAPOMM"
                  },
                  {
                    value: "Reconsideration or Appeal",
                    label: "Reconsideration or Appeal"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "LandUseMenu").startup();

          //MECHANICAL ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Commercial",
                    label: "Commercial"
                  },
                  {
                    value: "Residential",
                    label: "Residential"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "MechanicalMenu").startup();

          //PLUMBING ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Commercial",
                    label: "Commercial"
                  },
                  {
                    value: "Residential",
                    label: "Residential"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "PlumbingMenu").startup();

          //ROW ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Construction",
                    label: "Construction"
                  },
                  {
                    value: "Occupancy",
                    label: "Occupancy"
                  },
                  {
                    value: "Tree",
                    label: "Tree"
                  },
                  {
                    value: "Use",
                    label: "Use"
                  },
                  {
                    value: "Utility",
                    label: "Utility"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "ROWMenu").startup();

          //SITE ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Deviation Request",
                    label: "Deviation Request"
                  },
                  {
                    value: "Development",
                    label: "Development"
                  },
                  {
                    value: "Noise Variance",
                    label: "Noise Variance"
                  },
                  {
                    value: "Utility",
                    label: "Utility"
                  },
                  {
                    value: "Work Order",
                    label: "Work Order"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "SiteDevelopmentMenu").startup();

          //UTILITY ...
          var memoryStore = new Memory({
                idProperty: "value",
                data: [{
                    value: "Surfacewater",
                    label: "Surfacewater"
                  },
                  {
                    value: "Wastewater",
                    label: "Wastewater"
                  },
                  {
                    value: "Water",
                    label: "Water"
                  }
                ]
              });

          var subCategoryStore = new ObjectStore({
                objectStore: memoryStore,
                labelProperty: "label"  // choose store property to display
              });

          new CheckedMultiSelect({
              dropDown: true,  //collapse
              multiple: true,
              store: subCategoryStore,
              onChange: lang.hitch(this, this._searchFilter)
          }, "UtilityMenu").startup();
        


          //End submenus ---------------------------------------------------------------------------------------

  		  //Create date selectors (created between) - https://dojotoolkit.org/reference-guide/1.10/dijit/form/DateTextBox.html 
          new DateTextBox({
          	value: dateToday30Calendar, //30 days ago
            //value: '2015-01-01',  //31420
            //value: '2014-01-01',  //39297
            //value: '2013-01-01',  //  46636 - Upper limit 50k???
          	style: "width: 130px;",
            onChange: lang.hitch(this, this._searchFilter)
          }, "date1").startup();;

          new DateTextBox({
          	value: dateTodayCalendar, //today's date
          	style: "width: 130px;",
            onChange: lang.hitch(this, this._searchFilter)
          }, "date2").startup();;

        //Create checkbox for draw option
	        new CheckBox({
	          onChange: lang.hitch(this, this._drawLimitArea)
	        }, "checkBoxDraw").startup();

        //Create a button to remove drawn graphic
	        new Button({
	          label: 'Start Over',
	          iconClass: 'dijitIconDelete',
	          disabled: true,
	          onClick: lang.hitch(this, this._drawLimitArea)
	        }, "buttonDraw").startup();


        //Create draw toolbar
       this.map.on("load", this._drawCreateToolbar());

        //Create export to CSV button
          new Button({
              label: 'Download Current Selection (CSV)',
              iconClass: 'dijitEditorIcon dijitEditorIconInsertTable',
              onClick: lang.hitch(this, this._exportToCSV)
          }, "exportButton").startup();

          //Wait Progress Bar - https://developers.arcgis.com/javascript/3/jsapi/esri.dijit.util.busyindicator-amd.html
          var progressBar = "<div class='dijitProgressBar dijitProgressBarEmpty dijitProgressBarIndeterminate' role='progressbar' aria-labelledby='dijit_ProgressBar_0_label' aria-valuemin='0' aria-valuemax='100' id='dijit_ProgressBar_0' widgetid='dijit_ProgressBar_0' style='display: block;'><div data-dojo-attach-point='internalProgress' class='dijitProgressBarFull' style='width: 100%;'><div class='dijitProgressBarTile' role='presentation'></div><span style='visibility:hidden'>&nbsp;</span></div><div data-dojo-attach-point='labelNode' class='dijitProgressBarLabel' id='dijit_ProgressBar_0_label'>&nbsp;</div><span data-dojo-attach-point='indeterminateHighContrastImage' class='dijitInline dijitProgressBarIndeterminateHighContrastImage' src='//js.arcgis.com/3.15/dijit/themes/a11y/indeterminate_progress.gif'></span></div>";
            document.getElementById("ProgressBar").innerHTML = progressBar;  //set html properties
            this._toggleLoader(true);  //toggle progress bar on
      //Search by Permit #
      new TextBox({  //Create a text box for permit # - https://dojotoolkit.org/api/
        placeHolder: "BLDCA19-0090 etc.",
        style: "width: 160px;",
        onKeyDown: lang.hitch(this, this._searchPermit) //allows enter key for alternative to button
      }, "PermitNum").startup();
      new Button({  //Create a button to search permit #
        showLabel: false,
        label: 'Find Permit Number', // analogous to title when showLabel is false
        iconClass: 'dijitEditorIconSpace', //empty image - place real image below
        onClick: lang.hitch(this, this._searchPermit)
      }, "buttonPermitNum").startup();
      //Sytle buttons after startup to override defaults
      dojo.style("buttonPermitNum", "height", "20px");
      dojo.style("buttonPermitNum", "width", "18px");
      dojo.style("buttonPermitNum", 'background-image', 'url(images/dataSearchIcon.png)');
      //end FILTER ----------------------------------------------------------------------

        json1 = json1_ALL = null;  //Use D3 queries -to update global variables to hold selected records (no var for global)
          
          var currentDate = new Date();  //use .getTime() to get a unique number (milliseconds since January 1, 1970) & force a fresh load of the CivicData json file
          var theHour = currentDate.getHours();  //just going to change the variable once a day, befor and after 9 am
              if (theHour < 9) {
                var timeVar = 'before9';
              } else {
                var timeVar = 'after9';
              }
          var theJsonFile = "data/Permits.json?v=" + timeVar;  //CivicData json file with a variable to force refresh before or after 9 am
          //var theJsonFile = "data/Permits.json?v=" + currentDate;  //TESTING ONLY!!! - Doesn't allow a json cache by browser
          
            this._download_D3(theJsonFile);  //D3 Library ----Use to download file and filter - http://learnjsdata.com/read_data.html
 
               var checkExist = setInterval(lang.hitch(this, function() { //Wait  until json objects (all permits - json1_ALL, selected permits - json1) are ready to start _extentWatch working 
                                     if (json1 != null && json1_ALL != null) {    //wait for All records object to be created - need for all future searches
                                        clearInterval(checkExist);  //stop object check
                                         this._paddingSubMenus();  //adjust the default padding for all submenus
                                         this._extentWatch(); //for running queries whenever extent changes
                                         lang.hitch(this, this.map.setLevel(this.map.getLevel()));  //Starts _extentWatch working 
                                     } //end object existence check
                                  }, 100)); // check every 100ms
         
        //end MJM layer ---------------------------------------------------------------------------------
    },

    onOpen: function() {
      this._jimuLayerInfos = LayerInfos.getInstanceSync();
      var legendParams = {
        arrangement: this.config.legend.arrangement,
        autoUpdate: this.config.legend.autoUpdate,
        respectCurrentMapScale: this.config.legend.respectCurrentMapScale,
        //respectVisibility: false,
        map: this.map,
        layerInfos: this._getLayerInfosParam()
      };
      this.legend = new Legend(legendParams, html.create("div", {}, this.domNode));
      this.legend.startup();
      this._bindEvent();
    },

    onClose: function() {
      this.legend.destroy();
    },

    //START MJM FUNCTIONS ------------------------------------------------------------------------------
    _toggleLoader: function(on) {
      //icons - http://www.ajaxload.info/
      if (on) {
        document.getElementById("ProgressBar").style.display = 'block';  //show progress bar
        document.getElementById('exportButtonDIV').style.display = 'none';  //hide Export CSV button
        document.getElementById("queryResults").innerHTML = 'Please wait, loading permits ...'; //Clear previous result details in legend panel - Widget.html
      } else {
        document.getElementById("ProgressBar").style.display = 'none';  //hide progress bar
        document.getElementById('exportButtonDIV').style.display = 'block';  //show Export CSV button
        document.getElementById("loader-wrapper").style.display = "none"; //remove loading map - only need to do once - after that always invisible
      }
    }, 

    _paddingSubMenus: function() {
      //change padding for text class within .dojoxCheckedMultiSelect
      var divsToPad = document.getElementsByClassName("dijitButtonText"); //Array of elements with the same class name
      for(var i = 0; i < divsToPad.length; i++){
          divsToPad[i].style.padding = "8px"; // increase padding from 2 on all submenus
      }
    }, 

    _toggleSubMenus: function() {
      var divsToHide = document.getElementsByClassName("subMenu"); //Array of elements with the same class name
      for(var i = 0; i < divsToHide.length; i++){
          divsToHide[i].style.display = "none"; // hide all submenus and leave no space
      }

       if (dijit.byId("categorySelect").value == 'Building' || dijit.byId("categorySelect").value == 'Demolition' || dijit.byId("categorySelect").value == 'Fire' || dijit.byId("categorySelect").value == 'LandUse' || dijit.byId("categorySelect").value == 'Mechanical' || dijit.byId("categorySelect").value == 'Plumbing' || dijit.byId("categorySelect").value == 'ROW' || dijit.byId("categorySelect").value == 'SiteDevelopment' || dijit.byId("categorySelect").value == 'Utility') { //just categories that have submenus
        document.getElementById(dijit.byId("categorySelect").value).style.display = 'block';  //show specific submenu - use same id name as menu selection value
       }
    },

    _download_D3: function(json) {
      d3.json(json, this._filter_D3);  //MJM - Use D3 Library to download file - http://learnjsdata.com/read_data.html- https://github.com/d3/d3/wiki#d3_selectAll
    },

    _filter_D3: function(json) {
      //Memory Management (may be a problem in IE) - https://auth0.com/blog/four-types-of-leaks-in-your-javascript-code-and-how-to-get-rid-of-them/
      //MJM - Use D3 filter to create several data arrays
      var jsonA = json.result.records;  //just use the records portion of the json
          this.json1_ALL = this.json1 = jsonA;  //Update global ALL RECORDS & Initial Select Records - to be used by all future queries
    },

    _requestLayerQuery: function(myMap, value) {
      //Redraw query layer  - Insert modified JSON here with D3 objects  (use JSON.parse to create object, JSON.stringify to read as string )
         var mapCounter = 0;  //counter to limit map markers for performance
         var mapLimit = 30000; //map marker limit
         var response = JSON.parse('{\"items\":' + JSON.stringify(value) + '}'); //query data as json object
         var features = [];
         var resultsText = '<b>' + response.items.length.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + '</b> selected permits in map extent.';

            if (response.items.length == 1) {
              if (permitNumberSearch == true) {
                resultsText = 'Selected by permit number = ' + response.items[0].Permit_Number;
              } else {
                resultsText = 'One selected permit in map extent.';
              }
            }
	         if (response.items.length > 1){
	         	resultsText += "<br>&nbsp;<br><i><b>NOTE:</b> Multiple permits may occur at one location.  Click marker for permit number and 'Browse Features' for individual permit details. <a href='Help.html#Identify' target='_blank'>HELP</a></i>";
	         }
          array.forEach(response.items, function(item) {  //loop through the items (SELECTED RECORDS) and add to the feature layer
            if (mapCounter < mapLimit){ //add to map, otherwise loop through but ignore the rest of records
              //Map markers
              var attr = {};  //fill in attributes
  	            attr["Permit_Number"] = item.Permit_Number;
  	            attr["Address_Line_1"] = item.Address_Line_1;
                attr["Permit_Type_Description"] = item.Permit_Type_Description;
                attr["Current_Status"] = item.Current_Status;
                attr["Status_Date"] = item.Status_Date;
                attr["Issued_Date"] = item.Issued_Date;
                attr["Fees_Paid"] = item.Fees_Paid;
                attr["Valuation"] = item.Valuation;
  	            attr["Description"] = item.Description;
  	            attr["Link"] = item.Link;
                attr["Longitude"] = item.Longitude;
                attr["Latitude"] = item.Latitude;
              var geometry = new Point( {"x": item.Longitude, "y": item.Latitude, "spatialReference": {"wkid": 4326 } });    //Use coordinate field names from data
              var graphic = new Graphic(geometry);
    	            graphic.setAttributes(attr);
    	            features.push(graphic);
              //Results text for side panel
              resultsText += "<hr color='#acb1db'><br>";
              resultsText += "<b>Permit: </b>" + item.Permit_Number + "<br>";
              resultsText += "<b>Address: </b>" + item.Address_Line_1 + "<br>";
              resultsText += "<b>Permit Type: </b>" + item.Permit_Type_Description + "<br>";
              resultsText += "<b>Current Status: </b>" + item.Current_Status + "<br>";
              resultsText += "<b>Status Date: </b>" + item.Status_Date + "<br>";
              resultsText += "<b>Issued Date: </b>" + item.Issued_Date + "<br>";
              resultsText += "<b>Fee: </b>" + item.Fees_Paid + "<br>";
              resultsText += "<b>Estimated Value: </b>" + item.Valuation + "<br>";  //form number with commas
              resultsText += "<b>Description: </b>" + item.Description + "<br>";
              resultsText += "<b><a target='_blank' href='" + item.Link + "' >More information</a></b><br>"
   	              if (response.items.length  < mapLimit){ //add to 'Zoom to' link to results, otherwise don't bother
                    if (item.Longitude<0 && item.Latitude>0){   //skip records without coordinates - already filtered out
      	             resultsText += "<b><a href='https://wspdsmap.cityoftacoma.org/website/Google/StreetView/?lat=" + item.Latitude + "&lon=" + item.Longitude + "' target='_blank'>Street View</a></b><br>"; 
      	             resultsText += "<b><a href='javascript:void(0);'  id='" + item.Permit_Number + "' >Zoom to</a></b><br>&nbsp;<br>"; 
      	            }
                  }
                mapCounter++ //increment by 1
            }
          });

         //Update query layer
          featureLayer.clear();  //Clears all graphics from layer (reset query to zero)
          featureLayer.applyEdits(features, null, null); //Apply edits to the feature layer. Updates layer.
            if (features.length == 1 ) {featureLayer.disableFeatureReduction()};  //Disable feature reduction (otherwise continues to have a cluster legend even with one record)
            if (screen.width>600 && features.length > 1 ) {  //Determine screen size for clusters (popup problem for clusters on mobile in WAB) - if >1 not used, then click event doesn't work if only one permit in map extent
              featureLayer.enableFeatureReduction();  //Now make it possible to cluster again
              featureLayer.setFeatureReduction({type: "cluster"}); //Cluster symbols
            }
          
          featureLayer.refresh();  //IMPORTANT: NEED TO USE WHEN CLUSTERING, OTHERWISE LAYER NOT VISIBLE (setFeatureReduction)!!!!!

          document.getElementById("queryResults").innerHTML = resultsText; //Update result details in legend panel - Widget.html
            if (response.items.length  < mapLimit){ //add to 'Zoom to' link to results, otherwise don't bother
              array.forEach(response.items, function(item) {  //now that widget panel has the html text loop through again and add zoom click event by permit number
                  var geometry = new Point( {"x": item.Longitude, "y": item.Latitude, "spatialReference": {"wkid": 4326 } });    //Use coordinate field names from data
                  on(document.getElementById("" + item.Permit_Number + ""), 'click', function(){myMap.centerAndZoom(esri.geometry.geographicToWebMercator(new esri.geometry.Point(geometry)), 19)});
                  mapCounter++ //increment by 1 
              });
            }
    },

    _drawLimitArea: function() {
      //MJM - Draw check box and remove button actions
      if (permitNumberSearch == true) { //was searching by permit #, but now switched back for drawing
        permitNumberSearch = false; //Update variable for checking if doing a permit number search
        //this.map.setLevel(this.map.getLevel() - 1); //Zoom map out one level to trigger map extent select
      }
      drawnGraphicsLayer.clear(); //Remove any existing graphics
      if (document.getElementById("checkBoxDraw").checked) { //Toggle edit toolbar
        this.toolbar.activate(Draw['POLYGON']);  //enable map draw ability
        dijit.byId("buttonDraw").setDisabled(false) // enable Redo Drawing button
        this._inDrawMode = true;
      } else {
        this.toolbar.deactivate();  //disable map draw ability
        dijit.byId("buttonDraw").setDisabled(true) // disable Redo Drawing button
        this._inDrawMode = false;
        this.map.setLevel((this.map.getLevel() - 1)); //Zoom out one level to trigger a new query (graphic removed, now query the new map extent)
      }
    },

    _drawCreateToolbar: function() {
      //MJM - add drawing ability
      this.toolbar = new Draw(this.map); 
      this.own(on(this.toolbar, "draw-end", lang.hitch(this, this._drawAddToMap))); //run after draw double-click
    },

    _drawAddToMap: function(evt) {
      //MJM - Add graphic to map
      this.toolbar.deactivate();  //disable draw ability
      this._inDrawMode = false;
      var graphic = new Graphic(evt.geometry, new SimpleFillSymbol());
      drawnGraphicsLayer.add(graphic);  //add polygon graphic to map graphics layer
      this.map.setExtent(graphic.geometry.getExtent(), true);  //Trigger a query (_extentQuery) by zooming to graphic extent
    },

    _extentWatch: function() {
      //MJM - run whenever map extent changes
      this.own(on(this.map, "extent-change", lang.hitch(this, this._extentWait))); 
    },

    _extentWait: function() {
      //MJM - wait for extent to stop changing
      if (this.sumTimer) {
        clearTimeout(this.sumTimer);
        this.sumTimer = null;
      }
      this.sumTimer = setTimeout(lang.hitch(this, this._extentQuery), 900);
    },

    _extentQuery: function() {
      //MJM - Query by extent or drawn polygon
      if (!permitNumberSearch) { //Do extent query if not currently searching by permit number (suspend otherwise)
        this._toggleSubMenus(); //show appropriate submenu and hide others
        //Currently selected dates
        var startDate = dojo.date.locale.format(dijit.byId("date1").value, {
          datePattern: "yyyy-MM-dd",
          selector: "date"
        }); //dates formatted different from Land Use Permits - Dojo date format - http://www.technicaladvices.com/2011/11/27/reading-the-dojo-datetextbox-in-your-custom-format/
        var endDate = dojo.date.locale.format(dijit.byId("date2").value, {
          datePattern: "yyyy-MM-dd",
          selector: "date"
        }); //dates formatted different from Land Use Permits

        if (!this._inDrawMode) { //Not in draw mode
          if (drawnGraphicsLayer.graphics.length == 0) { //No graphic drawn yet - Use MAP EXTENT for query
            var ext = this.map.extent; //array - ext.normalize() = object
            var lowerLeftLL = webMercatorUtils.xyToLngLat(ext.xmin, ext.ymin); //get map extent coordinates and run new query - WebMercator to geographic WGS84 (latitude / longitude)
            var upperRightLL = webMercatorUtils.xyToLngLat(ext.xmax, ext.ymax);
            //QUERY STEP 1. Update query object with current extent
            this.json1 = null; // Reset for D3 queries with new extent and selected dates
            this._toggleLoader(true); //toggle progress bar on
            lang.hitch(this, this._queryPermits(lowerLeftLL, upperRightLL, startDate, endDate)); //update queries 
          } else { //Graphic drawn - Use GRAPHIC COORDINATES for query
            var queryCoordinates = []; //Latitude and longitude coordinates to query by
            var graphicCoordinates = drawnGraphicsLayer.graphics[0].geometry.rings[0] //Drawn graphic (polygon) coordinates - just one [0] ring
            for (i = 0; i < graphicCoordinates.length; i++) {
              queryCoordinates.push(webMercatorUtils.xyToLngLat(graphicCoordinates[i][0], graphicCoordinates[i][1])); //Translates the given Web Mercator coordinates to Longitude and Latitude
            }
            var polygonPointsFiltered = json1_ALL.filter(function(d) {
              return d3.polygonContains(queryCoordinates, [d.Longitude, d.Latitude]) //returns each true record within polygon - See Chaining functions once categories are fixed in CivicData: http://learnjsdata.com/iterate_data.html
            });
            //QUERY STEP 1. Update query object with drawn polygon
            this.json1 = null; // Reset for D3 queries with new extent and selected dates
            this._toggleLoader(true); //toggle progress bar on
            lang.hitch(this, this._queryPermitsPolygon(polygonPointsFiltered, startDate, endDate)); //update queries 
          } //end graphic drawn check

          //QUERY STEP 2. Redraw resulting query query layer once query object is updated
          var checkExist2 = setInterval(lang.hitch(this, function() { //Wait for query array to be updated (_filter_D3)- then use for feature layer
            if (this.json1 != null) {
              clearInterval(checkExist2); //stop object check
              this._toggleLoader(false); //toggle progress bar off
              if (this.json1.length > 30000) {
                var msg = 'NOTE: Current selection equals ' + this.json1.length.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' records, but only the first 30,0000 will be displayed on map.' //format number with commas
                alert(msg);
              }
              lang.hitch(this, this._requestLayerQuery(this.map, this.json1)); //update selected permits on map
            } //end object existence check
          }, 100)); // check every 100ms
        } //end draw mode check
      }
    },

    _exportToCSV: function() {
      //Using D3 and d3-dsv for exporting to CSV (https://d3js.org/d3-dsv.v1.min.js) - https://jsfiddle.net/jossef/m3rrLzk0/
      //Update variables with current selection set (this.json1)
      var csvFile = d3.csvFormat(this.json1, ["Permit_Number", "Applied_Date", "Latitude", "Longitude", "Address_Line_1", "Permit_Type_Description", "Current_Status", "Status_Date", "Issued_Date", "Fees_Paid", "Valuation", "Description", "Link"]);  
      var filename = 'Selected_Permits.csv'

      //Download file depending on browser
      var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
      if (navigator.msSaveBlob) { // IE 10+
          navigator.msSaveBlob(blob, filename);
      } else {
          var link = document.createElement("a");
          if (link.download !== undefined) { // feature detection
              // Browsers that support HTML5 download attribute
              var url = URL.createObjectURL(blob);
              link.setAttribute("href", url);
              link.setAttribute("download", filename);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          }
      }
    },    

    _queryBuilding: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theBuildingList1 = theBuildingList2 = theBuildingList3 = theBuildingList4 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("BuildingMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Commercial Alteration'){
                 theBuildingList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Commercial Alteration ' || row['Permit_Type_Description'] == 'ePermit Commercial Overlay ' || row['Permit_Type_Description'] == 'ePermit Commercial Strip ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Commercial New Building'){
                 theBuildingList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Commercial New Building ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Residential Alteration'){
                 theBuildingList3 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Residential Alteration ' || row['Permit_Type_Description'] == 'ePermit Roof Overlay ' || row['Permit_Type_Description'] == 'ePermit Siding Replacement ' || row['Permit_Type_Description'] == 'ePermit Window Replacement ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Residential New Building'){
                 theBuildingList4 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Residential New Building ';  //menu value has a space on end
                 }); 
              }
            });
       return theBuildingList1.concat(theBuildingList2, theBuildingList3, theBuildingList4);  //concat all the selected record arrays together & send back the results
    },    

    _queryDemolition: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theDemolitionList1 = theDemolitionList2 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("DemolitionMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Commercial'){
                 theDemolitionList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Commercial Demolition ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Residential'){
                 theDemolitionList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Residential Demolition ' || row['Permit_Type_Description'] == 'ePermit Residential Accessory Demolition ' || row['Permit_Type_Description'] == 'ePermit Residential Accessory Demolition No Fee ' || row['Permit_Type_Description'] == 'ePermit Residential Demo ' || row['Permit_Type_Description'] == 'ePermit Residential Demolition ';  //menu value has a space on end
                 }); 
              }
            });
       return theDemolitionList1.concat(theDemolitionList2);  //concat all the selected record arrays together & send back the results
    },    

    _queryFire: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theFireList1 = theFireList2 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("FireMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Commercial'){
                 theFireList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Commercial Fire Protection ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Residential'){
                 theFireList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Residential Fire Protection ' || row['Permit_Type_Description'] == 'ePermit Fire Alarm ' || row['Permit_Type_Description'] == 'ePermit Fire Sprinkler ' || row['Permit_Type_Description'] == 'ePermit Fire Transmitter ';  //menu value has a space on end
                 }); 
              }
            });
       return theFireList1.concat(theFireList2);  //concat all the selected record arrays together & send back the results
    },    

    _queryLandUse: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theLandUseList1 = theLandUseList2 = theLandUseList3 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("LandUseMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Application'){
                 theLandUseList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Land Use Application ';  //menu value has a space on end
                 }); 
              }
              if (item == 'CAPOMM'){
                 theLandUseList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Land Use CAPOMM ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Reconsideration or Appeal'){
                 theLandUseList3 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Land Use Reconsideration or Appeal ';  //menu value has a space on end
                 }); 
              }
            });
       return theLandUseList1.concat(theLandUseList2, theLandUseList3);  //concat all the selected record arrays together & send back the results
    },    

    _queryMechanical: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theMechanicalList1 = theMechanicalList2 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("MechanicalMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Commercial'){
                 theMechanicalList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Commercial Mechanical ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Residential'){
                 theMechanicalList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Residential Mechanical ' || row['Permit_Type_Description'] == 'ePermit Residential Ductless ' || row['Permit_Type_Description'] == 'ePermit Residential Mechanical ';  //menu value has a space on end
                 }); 
              }
            });
       return theMechanicalList1.concat(theMechanicalList2);  //concat all the selected record arrays together & send back the results
    },  

    _queryPlumbing: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var thePlumbingList1 = thePlumbingList2 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("PlumbingMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Commercial'){
                 thePlumbingList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Commercial Plumbing ' || row['Permit_Type_Description'] == 'ePermit Irrigation BackflowPreventer ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Residential'){
                 thePlumbingList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Building Residential Plumbing ' || row['Permit_Type_Description'] == 'ePermit Furnace Replacement ' || row['Permit_Type_Description'] == 'ePermit HeatPump Replacement ' || row['Permit_Type_Description'] == 'ePermit Residential Plumbing ' || row['Permit_Type_Description'] == 'ePermit Water Repair ' || row['Permit_Type_Description'] == 'ePermit WaterHeater Replacement ';  //menu value has a space on end
                 }); 
              }
            });
       return thePlumbingList1.concat(thePlumbingList2);  //concat all the selected record arrays together & send back the results
    },  

    _queryROW: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theROWList1 = theROWList2 = theROWList3 = theROWList4 = theROWList5 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("ROWMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Construction'){
                 theROWList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Right-of-Way Construction ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Occupancy'){
                 theROWList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Right-of-Way Occupancy ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Tree'){
                 theROWList3 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Right-of-Way Tree ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Use'){
                 theROWList4 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Right-of-Way Use ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Utility'){
                 theROWList5 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Right-of-Way Utility ';  //menu value has a space on end
                 }); 
              }
            });
       return theROWList1.concat(theROWList2, theROWList3, theROWList4, theROWList5);  //concat all the selected record arrays together & send back the results
    },    

    _querySiteDevelopment: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theSiteDevelopmentList1 = theSiteDevelopmentList2 = theSiteDevelopmentList3 = theSiteDevelopmentList4 = theSiteDevelopmentList5 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("SiteDevelopmentMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Development'){
                 theSiteDevelopmentList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Site Development ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Deviation Request'){
                 theSiteDevelopmentList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Site Deviation Request ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Noise Variance'){
                 theSiteDevelopmentList3 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Site Noise Variance ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Utility'){
                 theSiteDevelopmentList4 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Site Utility ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Work Order'){
                 theSiteDevelopmentList5 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Site Work Order ';  //menu value has a space on end
                 }); 
              }
            });
       return theSiteDevelopmentList1.concat(theSiteDevelopmentList2, theSiteDevelopmentList3, theSiteDevelopmentList4, theSiteDevelopmentList5);  //concat all the selected record arrays together & send back the results
    },   

    _queryUtility: function(json1_ALL_tmp) {
       //Filter subcategories - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
       var theUtilityList1 = theUtilityList2 = theUtilityList3 = [];  //empty ones can be concated together
            array.forEach(dijit.byId("UtilityMenu").value, function(item) {  //loop through the items (SELECTED MENU ITEMS)
              if (item == 'Surfacewater'){
                 theUtilityList1 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Utility Connection Surfacewater ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Wastewater'){
                 theUtilityList2 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Utility Connection Wastewater ';  //menu value has a space on end
                 }); 
              }
              if (item == 'Water'){
                 theUtilityList3 = json1_ALL_tmp.filter(function(row) {
                    return row['Permit_Type_Description'] == 'Utility Connection Water ';  //menu value has a space on end
                 }); 
              }
            });
       return theUtilityList1.concat(theUtilityList2, theUtilityList3);  //concat all the selected record arrays together & send back the results
    },    

    _queryPermits: function(lowerLeftLL, upperRightLL, startDate, endDate) {
      //FILTER QUERIES - Update query object with current extent using D3 - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
      var json1_ALL_tmp = null;
      if (dijit.byId("categorySelect").value == 'All') { //excluding some categories from map
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] != 'Code Compliance Minimum Code Inspection ' && row['Permit_Type_Description'] != 'Code Compliance Violation Notice ');
          //return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate);  //for QC testing against CivicData table
        });
      } else if (dijit.byId("categorySelect").value == 'Building') {
        //Update selected records for Category
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Alteration ' || row['Permit_Type_Description'] == 'Building Commercial New Building ' || row['Permit_Type_Description'] == 'Building Residential Alteration ' || row['Permit_Type_Description'] == 'Building Residential New Building ' || row['Permit_Type_Description'] == 'ePermit Commercial Overlay ' || row['Permit_Type_Description'] == 'ePermit Commercial Strip ' || row['Permit_Type_Description'] == 'ePermit Roof Overlay ' || row['Permit_Type_Description'] == 'ePermit Siding Replacement ' || row['Permit_Type_Description'] == 'ePermit Window Replacement '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("BuildingMenu").value.length > 0 && dijit.byId("BuildingMenu").value.length < dijit.byId("BuildingMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryBuilding(json1_ALL_tmp); //need to process further for Building subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Demolition') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Demolition ' || row['Permit_Type_Description'] == 'Building Residential Demolition ' || row['Permit_Type_Description'] == 'ePermit Residential Accessory Demolition ' || row['Permit_Type_Description'] == 'ePermit Residential Accessory Demolition No Fee ' || row['Permit_Type_Description'] == 'ePermit Residential Demo ' || row['Permit_Type_Description'] == 'ePermit Residential Demolition '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("DemolitionMenu").value.length > 0 && dijit.byId("DemolitionMenu").value.length < dijit.byId("DemolitionMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryDemolition(json1_ALL_tmp); //need to process further for Demolition subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Fire') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Fire Protection ' || row['Permit_Type_Description'] == 'Building Residential Fire Protection ' || row['Permit_Type_Description'] == 'ePermit Fire Alarm ' || row['Permit_Type_Description'] == 'ePermit Fire Sprinkler ' || row['Permit_Type_Description'] == 'ePermit Fire Transmitter '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("FireMenu").value.length > 0 && dijit.byId("FireMenu").value.length < dijit.byId("FireMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryFire(json1_ALL_tmp); //need to process further for Fire subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Historic') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Historic Design Review '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'LandUse') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Land Use Application ' || row['Permit_Type_Description'] == 'Land Use CAPOMM ' || row['Permit_Type_Description'] == 'Land Use Reconsideration or Appeal '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("LandUseMenu").value.length > 0 && dijit.byId("LandUseMenu").value.length < dijit.byId("LandUseMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryLandUse(json1_ALL_tmp); //need to process further for LandUse subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Mechanical') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Mechanical ' || row['Permit_Type_Description'] == 'Building Residential Mechanical ' || row['Permit_Type_Description'] == 'ePermit Residential Ductless ' || row['Permit_Type_Description'] == 'ePermit Residential Mechanical '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("MechanicalMenu").value.length > 0 && dijit.byId("MechanicalMenu").value.length < dijit.byId("MechanicalMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryMechanical(json1_ALL_tmp); //need to process further for Mechanical subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Plumbing') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Plumbing ' || row['Permit_Type_Description'] == 'Building Residential Plumbing ' || row['Permit_Type_Description'] == 'ePermit Furnace Replacement ' || row['Permit_Type_Description'] == 'ePermit HeatPump Replacement ' || row['Permit_Type_Description'] == 'ePermit Irrigation BackflowPreventer ' || row['Permit_Type_Description'] == 'ePermit Residential Plumbing ' || row['Permit_Type_Description'] == 'ePermit Water Repair ' || row['Permit_Type_Description'] == 'ePermit WaterHeater Replacement '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("PlumbingMenu").value.length > 0 && dijit.byId("PlumbingMenu").value.length < dijit.byId("PlumbingMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryPlumbing(json1_ALL_tmp); //need to process further for Plumbing subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Pre-Application') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Pre-Application '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'ROW') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Right-of-Way Construction ' || row['Permit_Type_Description'] == 'Right-of-Way Occupancy ' || row['Permit_Type_Description'] == 'Right-of-Way Tree ' || row['Permit_Type_Description'] == 'Right-of-Way Use ' || row['Permit_Type_Description'] == 'Right-of-Way Utility '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("ROWMenu").value.length > 0 && dijit.byId("ROWMenu").value.length < dijit.byId("ROWMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryROW(json1_ALL_tmp); //need to process further for ROW subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Sign') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Sign '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'SiteDevelopment') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Site Deviation Request ' || row['Permit_Type_Description'] == 'Site Development ' || row['Permit_Type_Description'] == 'Site Noise Variance ' || row['Permit_Type_Description'] == 'Site Utility ' || row['Permit_Type_Description'] == 'Site Work Order '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("SiteDevelopmentMenu").value.length > 0 && dijit.byId("SiteDevelopmentMenu").value.length < dijit.byId("SiteDevelopmentMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._querySiteDevelopment(json1_ALL_tmp); //need to process further for SiteDevelopment subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'SpecialEvent') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Special Event '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'Tree') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'ePermit Commercial Tree ' || row['Permit_Type_Description'] == 'ePermit Tree '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'Utility') {
        json1_ALL_tmp = json1_ALL.filter(function(row) {
          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Utility Connection Surfacewater ' || row['Permit_Type_Description'] == 'Utility Connection Wastewater ' || row['Permit_Type_Description'] == 'Utility Connection Water '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("UtilityMenu").value.length > 0 && dijit.byId("UtilityMenu").value.length < dijit.byId("UtilityMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryUtility(json1_ALL_tmp); //need to process further for Utility subcategory selection
        }
      }

      //Check for Status selection
      this._queryPermitStatus(json1_ALL_tmp); //need to process further for Status selection
    },

    _queryPermitsPolygon: function(json1_POLYGON, startDate, endDate) {
      //FILTER QUERIES - Update query object with current extent using D3 - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
      var json1_ALL_tmp = null;
      if (dijit.byId("categorySelect").value == 'All') { //excluding some categories from map
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] != 'Code Compliance Minimum Code Inspection ' && row['Permit_Type_Description'] != 'Code Compliance Violation Notice ' && row['Permit_Type_Description'] != 'Documents Bond ');
          //return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate);  //TEST for comparing to CivicData Table when table id changes
        });
      } else if (dijit.byId("categorySelect").value == 'Building') {
        //Update selected records for Category
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Alteration ' || row['Permit_Type_Description'] == 'Building Commercial New Building ' || row['Permit_Type_Description'] == 'Building Residential Alteration ' || row['Permit_Type_Description'] == 'Building Residential New Building ' || row['Permit_Type_Description'] == 'ePermit Commercial Overlay ' || row['Permit_Type_Description'] == 'ePermit Commercial Strip ' || row['Permit_Type_Description'] == 'ePermit Roof Overlay ' || row['Permit_Type_Description'] == 'ePermit Siding Replacement ' || row['Permit_Type_Description'] == 'ePermit Window Replacement '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("BuildingMenu").value.length > 0 && dijit.byId("BuildingMenu").value.length < dijit.byId("BuildingMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryBuilding(json1_ALL_tmp); //need to process further for Building subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Demolition') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Demolition ' || row['Permit_Type_Description'] == 'Building Residential Demolition ' || row['Permit_Type_Description'] == 'ePermit Residential Accessory Demolition ' || row['Permit_Type_Description'] == 'ePermit Residential Accessory Demolition No Fee ' || row['Permit_Type_Description'] == 'ePermit Residential Demo ' || row['Permit_Type_Description'] == 'ePermit Residential Demolition '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("DemolitionMenu").value.length > 0 && dijit.byId("DemolitionMenu").value.length < dijit.byId("DemolitionMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryDemolition(json1_ALL_tmp); //need to process further for Demolition subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Fire') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Fire Protection ' || row['Permit_Type_Description'] == 'Building Residential Fire Protection ' || row['Permit_Type_Description'] == 'ePermit Fire Alarm ' || row['Permit_Type_Description'] == 'ePermit Fire Sprinkler ' || row['Permit_Type_Description'] == 'ePermit Fire Transmitter '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("FireMenu").value.length > 0 && dijit.byId("FireMenu").value.length < dijit.byId("FireMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryFire(json1_ALL_tmp); //need to process further for Fire subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Historic') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Historic Design Review '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'LandUse') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Land Use Application ' || row['Permit_Type_Description'] == 'Land Use CAPOMM ' || row['Permit_Type_Description'] == 'Land Use Reconsideration or Appeal '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("LandUseMenu").value.length > 0 && dijit.byId("LandUseMenu").value.length < dijit.byId("LandUseMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryLandUse(json1_ALL_tmp); //need to process further for LandUse subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Mechanical') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Mechanical ' || row['Permit_Type_Description'] == 'Building Residential Mechanical ' || row['Permit_Type_Description'] == 'ePermit Residential Ductless ' || row['Permit_Type_Description'] == 'ePermit Residential Mechanical '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("MechanicalMenu").value.length > 0 && dijit.byId("MechanicalMenu").value.length < dijit.byId("MechanicalMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryMechanical(json1_ALL_tmp); //need to process further for Mechanical subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Plumbing') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Building Commercial Plumbing ' || row['Permit_Type_Description'] == 'Building Residential Plumbing ' || row['Permit_Type_Description'] == 'ePermit Furnace Replacement ' || row['Permit_Type_Description'] == 'ePermit HeatPump Replacement ' || row['Permit_Type_Description'] == 'ePermit Irrigation BackflowPreventer ' || row['Permit_Type_Description'] == 'ePermit Residential Plumbing ' || row['Permit_Type_Description'] == 'ePermit Water Repair ' || row['Permit_Type_Description'] == 'ePermit WaterHeater Replacement '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("PlumbingMenu").value.length > 0 && dijit.byId("PlumbingMenu").value.length < dijit.byId("PlumbingMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryPlumbing(json1_ALL_tmp); //need to process further for Plumbing subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Pre-Application') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Pre-Application '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'ROW') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Right-of-Way Construction ' || row['Permit_Type_Description'] == 'Right-of-Way Occupancy ' || row['Permit_Type_Description'] == 'Right-of-Way Tree ' || row['Permit_Type_Description'] == 'Right-of-Way Use ' || row['Permit_Type_Description'] == 'Right-of-Way Utility '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("ROWMenu").value.length > 0 && dijit.byId("ROWMenu").value.length < dijit.byId("ROWMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryROW(json1_ALL_tmp); //need to process further for ROW subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'Sign') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Sign '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'SiteDevelopment') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Site Deviation Request ' || row['Permit_Type_Description'] == 'Site Development ' || row['Permit_Type_Description'] == 'Site Noise Variance ' || row['Permit_Type_Description'] == 'Site Utility ' || row['Permit_Type_Description'] == 'Site Work Order '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("SiteDevelopmentMenu").value.length > 0 && dijit.byId("SiteDevelopmentMenu").value.length < dijit.byId("SiteDevelopmentMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._querySiteDevelopment(json1_ALL_tmp); //need to process further for SiteDevelopment subcategory selection
        }
      } else if (dijit.byId("categorySelect").value == 'SpecialEvent') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Special Event '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'Tree') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'ePermit Commercial Tree ' || row['Permit_Type_Description'] == 'ePermit Tree '); //menu value has a space on end
        });
      } else if (dijit.byId("categorySelect").value == 'Utility') {
        json1_ALL_tmp = json1_POLYGON.filter(function(row) {
          return Date.parse(row['Applied_Date']) <= Date.parse(endDate) && Date.parse(row['Applied_Date']) >= Date.parse(startDate) && (row['Permit_Type_Description'] == 'Utility Connection Surfacewater ' || row['Permit_Type_Description'] == 'Utility Connection Wastewater ' || row['Permit_Type_Description'] == 'Utility Connection Water '); //menu value has a space on end
        });
        //Determine if subcategories are needed 
        if (dijit.byId("UtilityMenu").value.length > 0 && dijit.byId("UtilityMenu").value.length < dijit.byId("UtilityMenu").options.length) { //determine how many submenu items checked (between none or all (options))
          json1_ALL_tmp = this._queryUtility(json1_ALL_tmp); //need to process further for Utility subcategory selection
        }
      }

      //Check for Status selection
      this._queryPermitStatus(json1_ALL_tmp); //need to process further for Status selection
    },

    _queryPermitStatus: function(json1_ALL_tmp) {
      //Query for all possible Status besides 'All'
      if (dijit.byId("statusSelect").value =='All') { //excluding some categories from map
         json1_ALL_tmp2 = json1_ALL_tmp.filter(function(row) {
            return row['Current_Status'] != 'Canceled'  && row['Current_Status'] != 'Cancelled' && row['Current_Status'] != 'Code Enforcement' && row['Current_Status'] != 'Complete - No Violation' && row['Current_Status'] != 'Complete - Violation Corrected' && row['Current_Status'] != 'Permit Canceled' && row['Current_Status'] != 'Under Investigation'; 
            //return row['Current_Status'] != 'x'  //TEST for comparing to CivicData Table when table id changes
         });
      } else if (dijit.byId("statusSelect").value =='Application') {
         json1_ALL_tmp2 = json1_ALL_tmp.filter(function(row) {
            return row['Current_Status'] == 'Addl Information Required' || row['Current_Status'] == 'Application Accepted' || row['Current_Status'] == 'Application Submitted' || row['Current_Status'] == 'Complete Application' || row['Current_Status'] == 'Incomplete Application' || row['Current_Status'] == 'Intake' || row['Current_Status'] == 'Missing or Incorrect Info' || row['Current_Status'] == 'Missing Required Documents' || row['Current_Status'] == 'Pending Intake Screening' || row['Current_Status'] == 'Permit Fees Due' || row['Current_Status'] == 'Waiting for Information' || row['Current_Status'] == 'Incomplete/Requires Pre-App';
          });
      } else if (dijit.byId("statusSelect").value =='Review') {
         json1_ALL_tmp2 = json1_ALL_tmp.filter(function(row) {
            return row['Current_Status'] == 'Active' || row['Current_Status'] == 'Awaiting Resubmitatl/Revisions' || row['Current_Status'] == 'Awaiting Resubmittal' || row['Current_Status'] == 'Awaiting Resubmittal/Revisions' || row['Current_Status'] == 'Comments Pending' || row['Current_Status'] == 'Comments Provided' || row['Current_Status'] == 'Consultation Meeting Required' || row['Current_Status'] == 'Decision Pending' || row['Current_Status'] == 'DNS' || row['Current_Status'] == 'Electronic Review' || row['Current_Status'] == 'Electronic Review Only' || row['Current_Status'] == 'Field Revisions' || row['Current_Status'] == 'Form Routed for Signature' || row['Current_Status'] == 'In Review' || row['Current_Status'] == 'Meeting Held' || row['Current_Status'] == 'Meeting Scheduled' || row['Current_Status'] == 'NPDES Inspection Required' || row['Current_Status'] == 'Pending Internal Action' || row['Current_Status'] == 'Plan Review in Process'  || row['Current_Status'] == 'Plan Review In Process' || row['Current_Status'] == 'Plan Review in Progress' || row['Current_Status'] == 'Plans Routed for Review' || row['Current_Status'] == 'Precon Meeting Required' || row['Current_Status'] == 'Precon Meeting Scheduled' || row['Current_Status'] == 'Ready to Issue' || row['Current_Status'] == 'Referred to Code Enforcement' || row['Current_Status'] == 'Resbumittal Required' || row['Current_Status'] == 'Resubmittal Required' || row['Current_Status'] == 'Revision Required' || row['Current_Status'] == 'Revision Review in Process' || row['Current_Status'] == 'Revision Review in Progress' || row['Current_Status'] == 'Revisions Approved' || row['Current_Status'] == 'Revisions Required' || row['Current_Status'] == 'Revisions Routed for Review' || row['Current_Status'] == 'Revisons Required';
         });
      } else if (dijit.byId("statusSelect").value =='Inspections') {
         json1_ALL_tmp2 = json1_ALL_tmp.filter(function(row) {
            return row['Current_Status'] == 'Permit Issued' || row['Current_Status'] == 'Temp CO Issued'; 
         });
      } else if (dijit.byId("statusSelect").value =='Finalized') {
         json1_ALL_tmp2 = json1_ALL_tmp.filter(function(row) {
            return row['Current_Status'] == 'C of O Issued' || row['Current_Status'] == 'Cert of Completion Issued' || row['Current_Status'] == 'Closed' || row['Current_Status'] == 'Decision Final' || row['Current_Status'] == 'Decision Issued' || row['Current_Status'] == 'Denied' || row['Current_Status'] == 'Expired' || row['Current_Status'] == 'Final' || row['Current_Status'] == 'Final Decision' || row['Current_Status'] == 'Final Inspection' || row['Current_Status'] == 'Finaled' || row['Current_Status'] == 'Permit Denied' || row['Current_Status'] == 'Permit Expired' || row['Current_Status'] == 'Permit Finaled' || row['Current_Status'] == 'Reconsideration Decision Issue' || row['Current_Status'] == 'Reconsideration Denied' || row['Current_Status'] == 'Released' || row['Current_Status'] == 'Staff Report Complete' || row['Current_Status'] == 'Staff Report In Process';
         });
      }
      this.json1 = json1_ALL_tmp2;  //Update global Selected RECORDS
      //console.error(this.json1.length);
    },

    _searchPermit: function(event) { //MJM - Find by permit number
      if (event.keyCode == 13 || event.buttons == 0) { // Run only if enter key in input box (13) or left mouse-click on search button (0) 
        permitNumberSearch = true; //Update variable for checking if doing a permit number search - Filter
        json_PermitNumber = json1.filter(function(row) { //Filter by Permit Number from text box
          return row['Permit_Number'] == document.getElementById("PermitNum").value.trim().toUpperCase(); //Remove whitespace from both sides of a string, change to upper case - FIELD NAME RecordNumber in LAND USE PERMITS
        });
        if (json_PermitNumber.length) { //permit found
          var geometry = new Point({ //Permit coordinates
            "x": json_PermitNumber[0].Longitude,
            "y": json_PermitNumber[0].Latitude,
            "spatialReference": {
              "wkid": 4326
            }
          });
          this.map.centerAndZoom(geometry, 18); //Use permit coordinates to zoom map to level 18
          lang.hitch(this, this._requestLayerQuery(this.map, json_PermitNumber)); //Update query layer on map
        } else {
          alert('Permit number ' + document.getElementById("PermitNum").value.trim() + ' not found.')
        }
      }
    },

    _searchFilter: function() { //MJM - Filter options have been changed
      if (permitNumberSearch == true) { //was searching by permit #, but now switched back for drawing
        permitNumberSearch = false; //Update variable for checking if doing a permit number search
      }
      lang.hitch(this, this._extentQuery()); //start query by extent which will then updated permit query based on current selections - NEED () HERE!!
    },

    //END MJM FUNCTIONS ------------------------------------------------------------------------------

    _bindEvent: function() {
      if(this.config.legend.autoUpdate) {
        this.own(on(this._jimuLayerInfos,
                    'layerInfosIsShowInMapChanged',
                    lang.hitch(this, 'refreshLegend')));

        this.own(on(this._jimuLayerInfos,
                    'layerInfosChanged',
                    lang.hitch(this, 'refreshLegend')));

        this.own(on(this._jimuLayerInfos,
                    'layerInfosRendererChanged',
                    lang.hitch(this, 'refreshLegend')));
      }
    },

    _getLayerInfosParam: function() {
      var layerInfosParam;
      if(this.config.legend.layerInfos === undefined) {
        // widget has not been configed.
        layerInfosParam = legendUtils.getLayerInfosParam();
      } else {
        // widget has been configed, respect config.
        layerInfosParam = legendUtils.getLayerInfosParamByConfig(this.config.legend);
      }

      // filter layerInfosParam
      //return this._filterLayerInfsParam(layerInfosParam);
      return layerInfosParam;
    },

    refreshLegend: function() {
      var layerInfos = this._getLayerInfosParam();
      this.legend.refresh(layerInfos);
    }

  });
  return clazz;
});
