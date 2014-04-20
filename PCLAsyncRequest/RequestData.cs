using System;
using System.Net;
using System.IO;
namespace PCLAsyncRequest
{
	public class RequestData
	{
		public RequestData ()
		{
		}

		public void GetWeather(string City)
		{
			HttpWebRequest request = WebRequest.Create(Url) as HttpWebRequest;

			request.Method = "GET";
			request.ContentType = "application/json";
			request.BeginGetResponse(new AsyncCallback(ProcessRestJsonLINQHttpResponse), request);

		}
	}
}

