import { ApprovalEvent, TransferEvent } from "@/types/TokenABI";

export interface IEventListenerData {
  eventName: "Transfer" | "Approval";
  blockNumber: number;
  transactionHash: string;
  args: TransferEvent.OutputObject | ApprovalEvent.OutputObject;
}
