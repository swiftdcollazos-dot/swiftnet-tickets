"use client";

import { useState } from "react";
import { CLIENT_TYPES, CLIENT_TYPE_LABELS, type ClientType } from "@/lib/types";

/** Client type picker; contract clients also get a monthly fee field. */
export function ClientTypeFields(props: {
  idPrefix: string;
  typeName: string;
  feeName: string;
  type?: ClientType;
  feeCents?: number;
  /** Keep the type fixed (for example, contract when adding a client from a service call). */
  locked?: boolean;
}) {
  const [type, setType] = useState<ClientType>(props.type ?? "hourly");
  const typeId = `${props.idPrefix}-${props.typeName}`;
  const feeId = `${props.idPrefix}-${props.feeName}`;
  return (
    <>
      {props.locked ? (
        <input type="hidden" name={props.typeName} value={type} />
      ) : (
        <div>
          <label className="label" htmlFor={typeId}>
            Client type
          </label>
          <select
            className="input"
            id={typeId}
            name={props.typeName}
            value={type}
            onChange={(e) => setType(e.target.value as ClientType)}
          >
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLIENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      )}
      {type === "contract" && (
        <div>
          <label className="label" htmlFor={feeId}>
            Monthly fee ($)
          </label>
          <input
            className="input"
            id={feeId}
            name={props.feeName}
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              props.feeCents ? (props.feeCents / 100).toFixed(2) : ""
            }
          />
        </div>
      )}
    </>
  );
}
