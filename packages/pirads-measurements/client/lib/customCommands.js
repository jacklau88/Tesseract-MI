import { Mongo } from 'meteor/mongo';
import { OHIF } from 'meteor/ohif:core';
import { cornerstoneTools, cornerstone } from 'meteor/ohif:cornerstone';
import { $ } from 'meteor/jquery';
import { Session } from 'meteor/session';


fiducialsCollection = new Mongo.Collection('fiducialsCollection', { connection: null });
const probeSynchronizer = new cornerstoneTools.Synchronizer('cornerstonenewimage', cornerstoneTools.stackImagePositionSynchronizer);
const toolsToSync = ['fiducial', 'aiFiducial'];

function getPatientPoint(imagePoint, element) {
  const image = cornerstone.getEnabledElement(element).image;
  const imagePlane = cornerstone.metaData.get('imagePlaneModule', image.imageId);
  const result = cornerstoneTools.imagePointToPatientPoint(imagePoint, imagePlane);

  Session.set('currentFidLps', result);

  return result;
}

function getImagePoint(patientPoint, element) {
  const image = cornerstone.getEnabledElement(element).image;
  const imagePlane = cornerstone.metaData.get('imagePlaneModule', image.imageId);
  const result = cornerstoneTools.projectPatientPointToImagePlane(patientPoint, imagePlane);

  Session.set('currentFidImagePoint', result);

  return result;
}

function isInBoundary(element, coords) {
  const image = cornerstone.getEnabledElement(element).image;
  const width = image.width;
  const height = image.height;
  return 0 <= coords.x && coords.x <= width && coords.y <= height && 0 <= coords.y;
}

function openSidebarOnFindings() {
  if (!($('.report-btn a:first').hasClass('active'))) {
    $('.report-btn a:first').trigger('click');
    $('.roundedButtonWrapper[data-value="findings"]').trigger('click');
  } else {
    $('.roundedButtonWrapper[data-value="findings"]').trigger('click');
  }
}

// TODO: clean and comment for all the functions
function addFiducial(element, measurementData, toolType) {

  const studyInstanceUid = OHIF.viewerbase.layoutManager.viewportData[Session.get('activeViewport')]['studyInstanceUid'];
  const studyInstanceUidString = studyInstanceUid.toString();
  const patientPoint = getPatientPoint(measurementData.handles.end, element);
  let imageIds = [];

  openSidebarOnFindings();

  $('.imageViewerViewport').each((index, ele) => {
    if (ele !== element) {
      try {
          cornerstone.getEnabledElement(ele);
          const imagePoint = getImagePoint(patientPoint, ele);
          let elementSpecificMeasurementData = $.extend(true, {}, measurementData);
          elementSpecificMeasurementData.handles.end.x = imagePoint.x;
          elementSpecificMeasurementData.handles.end.y = imagePoint.y;

          if (!(isInBoundary(ele, elementSpecificMeasurementData.handles.end))) {
            elementSpecificMeasurementData.visible = false;
          }

          $(ele).off('cornerstonetoolsmeasurementadded');
          cornerstoneTools.addToolState(ele, toolType, elementSpecificMeasurementData);
          cornerstone.updateImage(ele);
          bindToMeasurementAdded(ele);
          imageIds.push(cornerstone.getEnabledElement(ele).image.imageId);

      } catch (error) {
          return;
      }
    }
  });

  // $('.imageViewerViewport').each((index, ele) => {
  //
  //   if (measurementData.hasOwnProperty('server')) {
  //     id = 'server.'.concat(measurementData.f_id);
  //   }
  // });

  if (!measurementData.hasOwnProperty('server')) {
    Session.set('lastFidId', measurementData.id);
    let fiducial = {
      'toolType': measurementData.toolType,
      'id': measurementData.id,
      'studyInstanceUid': studyInstanceUid,
      'imageIds': imageIds,
      'patientPoint': patientPoint
    }

    fiducialsCollection.insert(fiducial);
  }
}


function descriptionMap(seriesDescription) {
  if (seriesDescription.includes('t2_tse_tra')) {
    return 'tra';
  } else if (seriesDescription.includes('_ADC')) {
    return 'adc';
  } else if (seriesDescription.includes('_BVAL')) {
    return 'hbval';
  } else if (seriesDescription.includes('KTrans')) {
    return 'ktrans';
  }
}


function removeFiducial(element, measurementData, toolType) {
  if (measurementData.hasOwnProperty('server')) {
    $(element).off('cornerstonetoolsmeasurementadded');
    cornerstoneTools.addToolState(element, toolType, measurementData);
    cornerstone.updateImage(element);
    bindToMeasurementAdded(element);
  } else if (measurementData.hasOwnProperty('id')) {
    $('.imageViewerViewport').each((index, ele) => {
      const toolData = cornerstoneTools.getElementToolStateManager(ele).get(ele, toolType);

      for (let i = 0; i < toolData.data.length; i++) {
        if (toolData.data[i].id === measurementData.id) {
          toolData.data.splice(i, 1);
        }
      }

      cornerstone.updateImage(ele);
    });
    fiducialsCollection.remove({
      'id': measurementData.id
    });
  }
}


function modifyFiducial(element, measurementData, toolType) {
  const patientPoint = getPatientPoint(measurementData.handles.end, element);

  if (measurementData.hasOwnProperty('server')) {
    const imageId = cornerstone.getEnabledElement(element).image.imageId;
    const seriesDescription = cornerstone.metaData.get('series', imageId)['seriesDescription'];
    const patientName = OHIF.viewer.Studies.all()[0]['patientName'];
    const pos = Fiducials.findOne({
      ProxID: patientName,
      fid: measurementData.f_id
    })[descriptionMap(seriesDescription)];
    measurementData.handles.end.x = pos.x;
    measurementData.handles.end.y = pos.y;
  } else {
    $('.imageViewerViewport').each((index, ele) => {
      if (ele !== element) {
        const toolData = cornerstoneTools.getElementToolStateManager(ele).get(ele, toolType);

        for (let i = 0; i < toolData.data.length; i++) {
          if (toolData.data[i].id === measurementData.id) {
            let elementSpecificMeasurementData = toolData.data[i];
            const imagePoint = getImagePoint(patientPoint, ele);
            elementSpecificMeasurementData.handles.end.x = imagePoint.x;
            elementSpecificMeasurementData.handles.end.y = imagePoint.y;
            if (isInBoundary(ele, elementSpecificMeasurementData.handles.end)) {
              elementSpecificMeasurementData.visible = true;
            } else {
              elementSpecificMeasurementData.visible = false;
            }
          }
        }

        cornerstone.updateImage(ele);
      }
    });

    let fiducial = {
      'patientPoint': patientPoint
    }

    fiducialsCollection.update({
      'id': measurementData.id
    }, {
      $set: fiducial
    });
  }
}


function bindToMeasurementAdded(element) {
  $(element).on('cornerstonetoolsmeasurementadded', (eve) => {
    let ev = eve.originalEvent;
    if (toolsToSync.includes(ev.detail.toolType)) {
      addFiducial(ev.target, ev.detail.measurementData, ev.detail.toolType);
    }
  });
}


function bindToMeasurementRemoved(element) {
  $(element).on('cornerstonemeasurementremoved', (eve) => {
    let ev = eve.originalEvent;
    if (toolsToSync.includes(ev.detail.toolType)) {
      removeFiducial(ev.target, ev.detail.measurementData, ev.detail.toolType);
    }
  });
}


function bindToMeasurementModified(element) {
  $(element).on('cornerstonetoolsmeasurementmodified', (eve) => {
    let ev = eve.originalEvent;
    if (toolsToSync.includes(ev.detail.toolType)) {
      modifyFiducial(ev.target, ev.detail.measurementData, ev.detail.toolType);
    }
  });
}


$('body').on('setActiveViewport', (event) => {
  $('.imageViewerViewport').each((index, element) => {
    bindToMeasurementAdded(element);
    bindToMeasurementRemoved(element);
    bindToMeasurementModified(element);
  });
});


$('body').on('syncViewports', (event) => {
  const activeTool = OHIF.viewerbase.toolManager.getActiveTool();
  if (toolsToSync.includes(activeTool)) {

    const activeViewportIndex = Session.get('activeViewport');
    const newIndex = OHIF.viewerbase.layoutManager.viewportData[activeViewportIndex]['currentImageIdIndex'];

    $('.imageViewerViewport').each((index, ele) => {
      try {
        cornerstone.getEnabledElement(ele);
        probeSynchronizer.add(ele);
      } catch (error) {
        return;
      }
    });

    $('.imageViewerViewport').promise().done(() => {
      try {
        const element = $('.imageViewerViewport')[activeViewportIndex];
        const stackSize = cornerstone.getEnabledElement(element).toolStateManager.toolState.stack.data[0].imageIds.length;

        let randInt = null;
        while (randInt === null || randInt === newIndex) {
          randInt = Math.round(Math.random() * (stackSize - 1));
        }

        cornerstoneTools.scrollToIndex(element, randInt);
        cornerstoneTools.scrollToIndex(element, newIndex);
      } catch (error) {
        return;
      }
    });
  } else if (probeSynchronizer) {
    probeSynchronizer.destroy();
  }
});

export {
  bindToMeasurementAdded
};
