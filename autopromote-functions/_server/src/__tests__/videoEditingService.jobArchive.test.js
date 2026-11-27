const mockCreate=jest.fn(),mockSet=jest.fn(),mockGet=jest.fn();
const mockDb={collection:jest.fn(()=>({doc:jest.fn(()=>({create:mockCreate,set:mockSet,get:mockGet}))}))};
const mockContext={bindJob:jest.fn(),confirmNoDispatch:jest.fn()};
jest.mock('../firebaseAdmin',()=>({admin:{},db:mockDb}));
jest.mock('axios',()=>({post:jest.fn()}));
jest.mock('../services/mediaWorkerTaskQueue',()=>({queueAudioExtractionTask:jest.fn()}));
jest.mock('../creditSystem',()=>({deductCredits:jest.fn(),refundCredits:jest.fn()}));
jest.mock('../utils/cloudRunAuth',()=>({buildWorkerRequestConfig:jest.fn()}));
jest.mock('../services/cloudRunJobService',()=>({}));
jest.mock('../services/multicamCapacityService',()=>({}));
jest.mock('../services/unifiedCredits/application',()=>({assertApplicationDatabase:jest.fn(),
 assertApplicationTransport:jest.fn(),getApplicationContext:jest.fn(()=>mockContext)}));
const VideoEditingService=require('../services/videoEditingService');
const {decodeStudioJobOptions}=require('../services/studioJobOptions');
beforeEach(()=>{jest.clearAllMocks();mockCreate.mockResolvedValue(undefined);mockSet.mockResolvedValue(undefined);mockGet.mockResolvedValue({exists:false});});

test('queue records archive large native options while the existing renderer receives the exact full object',async()=>{
 const service=new VideoEditingService();service.processJobBackground=jest.fn().mockResolvedValue(undefined);
 const options={renderViral:true,viralData:{brand_watermark:{enabled:false},keys:Array(15000).fill({property:'maskPoint0X',value:50,time:1})}};
 await service.startProcessingJob('https://owned.invalid/source',options,'owner',{jobId:'job',renderRequestId:'attempt'});
 const stored=mockCreate.mock.calls[0][0];expect(stored.optionsArchive).toBeDefined();
 expect(decodeStudioJobOptions(stored)).toEqual(options);
 expect(service.processJobBackground).toHaveBeenCalledWith('job','https://owned.invalid/source',options,'owner');
 expect(mockContext.bindJob).toHaveBeenCalledWith('video_edits','job');expect(mockContext.confirmNoDispatch).not.toHaveBeenCalled();
});
test('record creation failure confirms no dispatch and never invokes the background worker',async()=>{
 mockCreate.mockRejectedValueOnce(new Error('database unavailable'));
 const service=new VideoEditingService();service.processJobBackground=jest.fn();
 await expect(service.startProcessingJob('https://owned.invalid/source',{renderViral:true},'owner',{jobId:'job'})).rejects.toThrow('Failed to queue');
 expect(service.processJobBackground).not.toHaveBeenCalled();expect(mockContext.bindJob).not.toHaveBeenCalled();
 expect(mockContext.confirmNoDispatch).toHaveBeenCalledTimes(1);
});
