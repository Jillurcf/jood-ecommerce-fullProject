import {
  emitOrderCreated,
  emitOrderTrackingUpdated,
  emitOrderTrackingViewed,
  emitCartUpdated
} from "../../lib/emit.js";
import { emitOrderTrackingUpdated as centralEmit } from "../../lib/emit.js";
function emitFromApp(_app, event, payload) {
  try {
    if (event === "orderTrackingUpdated") {
      centralEmit(payload);
    }
  } catch (err) {
    console.warn(`emitFromApp(${event}) error:`, err);
  }
}
export {
  emitCartUpdated,
  emitFromApp,
  emitOrderCreated,
  emitOrderTrackingUpdated,
  emitOrderTrackingViewed
};
