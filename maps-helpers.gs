/**
 * RH Habits - Google Maps helper functions
 *
 * These functions are intentionally kept in a separate .gs file so the
 * existing code.gs logic does not need to be rewritten.
 * Google Apps Script compiles all .gs files in the same project together.
 */

/**
 * Build a normal Google Maps Directions URL for a saved trip that has
 * origin/destination text but no usable GPS track.
 *
 * Signature used by index.html:
 *   getGoogleMapsUrlForTrip({origin, destination})
 */
function getGoogleMapsUrlForTrip(trip) {
  trip = trip || {};

  var origin = String(trip.origin || '').trim();
  var destination = String(trip.destination || '').trim();

  if (!origin && !destination) {
    return 'https://www.google.com/maps';
  }

  var url = 'https://www.google.com/maps/dir/?api=1'
    + '&origin=' + encodeURIComponent(origin)
    + '&destination=' + encodeURIComponent(destination)
    + '&travelmode=driving';

  return url;
}

/**
 * Build a Google Maps Directions URL from a recorded GPS track.
 *
 * The frontend calls:
 *   getTripMapsUrl(gpsPoints, origin, destination)
 *
 * Google Maps Directions URLs have a practical waypoint limit, so we
 * sample the recorded GPS track instead of sending every point. This keeps
 * the URL usable while still following the actual recorded route shape.
 */
function getTripMapsUrl(gpsPoints, origin, destination) {
  var points = Array.isArray(gpsPoints) ? gpsPoints.filter(function (p) {
    return p
      && isFinite(Number(p.lat))
      && isFinite(Number(p.lng));
  }) : [];

  var originText = String(origin || '').trim();
  var destinationText = String(destination || '').trim();

  // Prefer the actual first/last GPS positions when available.
  if (points.length >= 2) {
    originText = Number(points[0].lat).toFixed(6) + ',' + Number(points[0].lng).toFixed(6);
    destinationText = Number(points[points.length - 1].lat).toFixed(6) + ',' + Number(points[points.length - 1].lng).toFixed(6);
  }

  if (!originText && !destinationText) {
    return 'https://www.google.com/maps';
  }

  var url = 'https://www.google.com/maps/dir/?api=1'
    + '&origin=' + encodeURIComponent(originText)
    + '&destination=' + encodeURIComponent(destinationText)
    + '&travelmode=driving';

  // Sample intermediate GPS points. Keep this comfortably below the
  // documented Google Maps Directions URL waypoint limit.
  if (points.length > 2) {
    var intermediates = points.slice(1, points.length - 1);
    var maxWaypoints = 20;

    if (intermediates.length > maxWaypoints) {
      var sampled = [];
      for (var i = 0; i < maxWaypoints; i++) {
        var ratio = i / Math.max(1, maxWaypoints - 1);
        var index = Math.round(ratio * (intermediates.length - 1));
        sampled.push(intermediates[index]);
      }
      intermediates = sampled;
    }

    var waypoints = intermediates.map(function (p) {
      return Number(p.lat).toFixed(6) + ',' + Number(p.lng).toFixed(6);
    });

    if (waypoints.length) {
      url += '&waypoints=' + encodeURIComponent(waypoints.join('|'));
    }
  }

  return url;
}
