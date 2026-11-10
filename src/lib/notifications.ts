export type AppNotification = {
 id:string; kind:'job'|'message'|'wallet'|'board'; title:string; titleEn:string;
 detail:string; detailEn:string; at:string; read:boolean; jobId?:string;
};
export type NotificationFeed={items:AppNotification[];unread:number};
