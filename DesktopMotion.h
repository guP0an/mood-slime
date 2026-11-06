#import <Cocoa/Cocoa.h>
#import <math.h>

static BOOL MoodShouldDrag(BOOL forced,NSEventModifierFlags flags) {
    if(flags&NSEventModifierFlagControl)return NO;
    return forced||(flags&NSEventModifierFlagOption)!=0;
}
static BOOL MoodShouldFollow(BOOL enabled,BOOL desktop,BOOL visible,BOOL paused,NSUInteger buttons) {
    return enabled&&desktop&&visible&&!paused&&buttons==0;
}
static NSPoint MoodTransferScreen(NSRect frame,NSRect oldVisible,NSRect newVisible) {
    CGFloat rx=(frame.origin.x-oldVisible.origin.x)/MAX(1,oldVisible.size.width-frame.size.width);
    CGFloat ry=(frame.origin.y-oldVisible.origin.y)/MAX(1,oldVisible.size.height-frame.size.height);
    CGFloat x=newVisible.origin.x+MAX(0,MIN(1,rx))*MAX(0,newVisible.size.width-frame.size.width);
    CGFloat y=newVisible.origin.y+MAX(0,MIN(1,ry))*MAX(0,newVisible.size.height-frame.size.height);
    return NSMakePoint(x,y);
}
static NSRect MoodDesktopFrame(NSRect frame,NSRect visible,CGFloat scale) {
    if(!isfinite(scale))return frame;
    CGFloat maximum=MIN(2.,MIN(visible.size.width/340.,visible.size.height/300.));
    scale=MIN(MAX(.5,scale),maximum);
    NSSize size=NSMakeSize(round(340*scale),round(300*scale));
    CGFloat x=NSMidX(frame)-size.width/2,y=NSMidY(frame)-size.height/2;
    x=MIN(MAX(NSMinX(visible),x),NSMaxX(visible)-size.width);
    y=MIN(MAX(NSMinY(visible),y),NSMaxY(visible)-size.height);
    return NSMakeRect(x,y,size.width,size.height);
}
static NSPoint MoodFollowOrigin(NSRect frame,NSRect visible,NSPoint cursor,CGFloat elapsed,BOOL reduced) {
    if(!isfinite(cursor.x)||!isfinite(cursor.y)||!isfinite(elapsed)||elapsed<=0)return frame.origin;
    if(NSPointInRect(cursor,NSInsetRect(frame,-25,-25)))return frame.origin;
    // Keep the rendered face beside the pointer, leaving its click target free.
    CGFloat distance=frame.size.height*.33+46;
    CGFloat centerX=cursor.x+distance;
    if(centerX+frame.size.width/2>NSMaxX(visible))centerX=cursor.x-distance;
    CGFloat tx=centerX-frame.size.width/2,ty=cursor.y-frame.size.height*.5;
    CGFloat maxX=MAX(NSMinX(visible),NSMaxX(visible)-frame.size.width);
    CGFloat maxY=MAX(NSMinY(visible),NSMaxY(visible)-frame.size.height);
    tx=MIN(MAX(tx,NSMinX(visible)),maxX);ty=MIN(MAX(ty,NSMinY(visible)),maxY);
    CGFloat dx=tx-frame.origin.x,dy=ty-frame.origin.y,d=hypot(dx,dy);
    if(d<1)return frame.origin;
    CGFloat dt=MIN(elapsed,.1),alpha=1-exp(-(reduced?1.8:3.4)*dt);
    CGFloat step=MIN(d*alpha,(reduced?180:560)*dt);
    NSPoint next=NSMakePoint(frame.origin.x+dx/d*step,frame.origin.y+dy/d*step);
    // Switching displays may put the old frame outside the new visible area.
    next.x=MIN(MAX(next.x,NSMinX(visible)),maxX);next.y=MIN(MAX(next.y,NSMinY(visible)),maxY);
    return next;
}
